<template>
  <Dialog @clickOutside="close" class="-picker" :mask="false" :header-background="currentColor">
    <template v-slot:header>
      <div>
        <div class="title">{{ title }}</div>
      </div>
    </template>
    <Picker :mode="picker" :alpha="alpha" v-model="currentColor"></Picker>
    <div class="verte__controller">
      <Slider
        v-if="enableAlpha"
        class="-alpha"
        :gradient="[`rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, 0)`, `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, 1)`]"
        :min="0"
        :max="1"
        :step="0.01"
        :editable="false"
        :value="alpha"
        :showCompletion="false"
        v-model="alpha"
      >
      </Slider>
      <template v-if="rgbSliders">
        <Slider :gradient="[`rgb(0,${rgb.green},${rgb.blue})`, `rgb(255,${rgb.green},${rgb.blue})`]" v-model="rgb.red"> </Slider>
        <Slider :gradient="[`rgb(${rgb.red},0,${rgb.blue})`, `rgb(${rgb.red},255,${rgb.blue})`]" v-model="rgb.green"> </Slider>
        <Slider :gradient="[`rgb(${rgb.red},${rgb.green},0)`, `rgb(${rgb.red},${rgb.green},255)`]" v-model="rgb.blue"> </Slider>
      </template>
      <div class="verte__inputs mt8">
        <button class="btn -text -accent" @click="switchModel" type="button" title="Rotate" v-tippy>
          <i class="icon-refresh"></i>
        </button>
        <editable :content="typedColor" @output="inputChanged($event)"></editable>
        <button class="btn -text -accent" @click="submit" type="button" title="Save color" v-tippy>
          <i class="icon-check"></i>
        </button>
      </div>
      <div class="verte__recent" ref="recent" v-if="showPalette">
        <a
          class="verte__recent-color"
          role="button"
          href="#"
          v-for="clr in colors"
          :key="clr"
          :style="`color: ${clr}`"
          @click.prevent="selectColor(clr)"
        >
        </a>
      </div>
      <div class="verte__recent" ref="recent" v-if="showHistory">
        <a
          class="verte__recent-color"
          role="button"
          href="#"
          v-for="clr in historySource"
          :key="clr"
          :style="`color: ${clr}`"
          @click.prevent="selectColor(clr)"
        >
        </a>
      </div>
    </div>
  </Dialog>
</template>

<script>
import { toRgb, toHex, toHsl, isValidHex, isValidRgb, isValidHsl, formatRgb, formatHsl, formatHex, whichModel } from 'color-fns'
import Picker from './Picker.vue'
import Slider from './Slider.vue'
import { warn, makeListValidator } from '../../../utils/picker'

import { PALETTE } from '@/utils/colors'

import Dialog from '@/components/framework/Dialog.vue'
import dialogMixin from '../../../mixins/dialogMixin'

export default {
  name: 'Verte',
  mixins: [dialogMixin],
  components: {
    Dialog,
    Picker,
    Slider
  },
  props: {
    picker: {
      type: String,
      default: 'square',
      validator: makeListValidator('picker', ['wheel', 'square'])
    },
    value: {
      type: String,
      default: '#000'
    },
    title: {
      type: String,
      default: 'Colorpicker'
    },
    model: {
      type: String,
      default: 'rgb',
      validator: makeListValidator('model', ['rgb', 'hex', 'hsl'])
    },
    display: {
      type: String,
      default: 'picker',
      validator: makeListValidator('display', ['picker', 'widget'])
    },
    menuPosition: {
      type: String,
      default: 'bottom',
      validator: makeListValidator('menuPosition', ['top', 'bottom', 'left', 'right', 'center'])
    },
    showHistory: {
      type: Boolean,
      default: true
    },
    showPalette: {
      type: Boolean,
      default: true
    },
    colorHistory: {
      type: Array,
      default: null
    },
    enableAlpha: {
      type: Boolean,
      default: true
    },
    rgbSliders: {
      type: Boolean,
      default: false
    }
  },
  data: () => ({
    rgb: toRgb('#000'),
    hex: toHex('#000'),
    hsl: toHsl('#000'),
    delta: { x: 0, y: 0 },
    type: 'rgb',
    internalColorHistory: []
  }),
  beforeDestroy() {
    document.getElementById('app').classList.remove('-picking-color')
  },
  computed: {
    colors: () => PALETTE,
    historySource() {
      return this.$store.state.settings.recentColors
    },
    currentColor: {
      get() {
        if (!this[this.model] && process.env.NODE_ENV !== 'production') {
          warn(`You are using a non-supported color model: "${this.model}", the supported models are: "rgb", "hsl" and "hex".`)
          return `rgb(0, 0, 0)`
        }

        if (this.model === 'rgb') {
          return formatRgb(this[this.model])
        } else if (this.model === 'hsl') {
          return formatHsl(this[this.model])
        } else if (this.model === 'hex') {
          return formatHex(this[this.model])
        } else {
          return ''
        }
      },
      set(val) {
        this.selectColor(val)
      }
    },
    typedColor() {
      if (this.type === 'rgb') {
        return formatRgb(this[this.type])
      } else if (this.type === 'hsl') {
        return formatHsl(this[this.type])
      } else if (this.type === 'hex') {
        return formatHex(this[this.type])
      } else {
        return this.currentColor
      }
    },
    alpha: {
      get() {
        if (!this[this.model]) {
          return 1
        }

        if (isNaN(this[this.model].alpha)) {
          return 1
        }

        return this[this.model].alpha
      },
      set(val) {
        this[this.model].alpha = val
        this.selectColor(this[this.model])
      }
    }
  },
  watch: {
    value(val, oldVal) {
      if (val === oldVal || val === this.currentColor) return

      // value was updated externally.
      this.selectColor(val)
    }
  },
  created() {
    this.selectColor(this.value || '#000', true)

    document.getElementById('app').classList.add('-picking-color')
  },
  methods: {
    selectColor(color, muted = false) {
      let colorStr = color

      if (typeof color === 'string' && color.length === 6) {
        color = '#' + color
      }

      if (isValidHsl(color)) {
        if (typeof color === 'string') {
          colorStr = color
        } else {
          colorStr = formatHsl(color)
        }
      } else if (isValidRgb(color)) {
        if (typeof color === 'string') {
          colorStr = color
        } else {
          colorStr = formatRgb(color)
        }
      } else if (isValidHex(color)) {
        if (typeof color === 'string') {
          colorStr = color
        } else {
          colorStr = formatHex(color)
        }
      } else {
        return
      }

      this.rgb = toRgb(colorStr)
      this.hex = toHex(colorStr)
      this.hsl = toHsl(colorStr)

      if (muted) {
        return
      }
      this.$emit('input', this.currentColor)
    },
    switchModel() {
      const models = ['hex', 'rgb', 'hsl']
      const indx = models.indexOf(this.type)
      this.type = models[indx + 1] || models[0]
    },
    submit() {
      this.$emit('beforeSubmit', this.currentColor)
      this.addColorToHistory(this.currentColor)
      this.$emit('input', this.currentColor)
      this.$emit('submit', this.currentColor)
    },
    addColorToHistory(color) {
      this.$store.dispatch('settings/addRecentColor', color)
    },
    inputChanged(value) {
      this.selectColor(value)

      this.type = whichModel(value)
    }
  }
}
</script>

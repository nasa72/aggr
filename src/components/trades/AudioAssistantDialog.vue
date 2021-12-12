<template>
  <Dialog @clickOutside="close" class="pane-dialog -medium" @mousedown="clickOutsideClose = false" @mouseup="clickOutsideClose = true">
    <template v-slot:header>
      <div class="title">{{ title }}</div>
    </template>

    <div v-if="type === 'synth'" class="form-group mb16">
      <label for="audio-assistant-source"> <i class="icon-music-note mr8"></i> Frequency </label>
      <div class="column">
        <slider
          class="mrauto -fill mt8 mb8"
          :min="0"
          :max="8902"
          :step="1"
          :editable="false"
          :label="true"
          :show-completion="true"
          :value="frequencyInput"
          @input="frequencyInput = $event"
          @reset="frequencyInput = 329.63"
        ></slider>
        <editable class="-center text-nowrap ml8" style="line-height:1" :content="frequencyInput" @output="frequencyInput = $event"></editable>
      </div>
    </div>
    <div v-else class="form-group mb16">
      <label for="audio-assistant-source"> <i class="icon-music-note mr8"></i> Source </label>
      <button class="btn -file -blue -large -cases w-100" @change="handleFile">
        <i class="icon-upload mr8"></i> Browse
        <input type="file" accept="audio/*" />
      </button>
    </div>

    <div class="form-group mb16">
      <label>Gain (controls the loudness)</label>

      <div class="column">
        <slider
          :min="0"
          :max="2"
          :step="0.01"
          :editable="false"
          :label="true"
          :show-completion="true"
          :value="gain"
          @input="gain = $event"
          @reset="gain = 1"
        ></slider>
        <label class="checkbox-control checkbox-control-input" title="Dynamic" v-tippy>
          <input type="checkbox" class="form-control" v-model="dynamicGain" />
          <div></div>
        </label>
      </div>
    </div>

    <div class="form-group mb16">
      <label>Length (remain at gain for n seconds)</label>

      <div class="column">
        <slider
          :min="0"
          :max="10"
          :step="0.1"
          :editable="false"
          :label="true"
          :show-completion="true"
          :value="holdDuration"
          @input="holdDuration = $event"
          @reset="holdDuration = 0"
        ></slider>
        <label class="checkbox-control checkbox-control-input" title="Dynamic" v-tippy>
          <input type="checkbox" class="form-control" v-model="dynamicLength" />
          <div></div>
        </label>
      </div>
    </div>

    <section class="section">
      <div v-if="showAdvanced">
        <div class="form-group mb16" v-if="type === 'synth'">
          <label>Wave type (<a href="https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode/type">learn more</a>)</label>
          <dropdown
            class="-left"
            :selected="osc"
            :options="['triangle', 'square', 'sine', 'sawtooth']"
            selectionClass="-outline form-control -arrow"
            return-value
            @output="osc = $event"
          ></dropdown>
        </div>

        <div class="column mb16">
          <div class="form-group -fill">
            <label>Fade In (smooth start length)</label>

            <slider
              :min="0"
              :max="10"
              :step="0.1"
              :editable="false"
              :label="true"
              :show-completion="true"
              class="mt8"
              :value="fadeIn"
              @input="fadeIn = $event"
              @reset="fadeIn = 0"
            ></slider>
          </div>

          <div class="ml8 form-group -fill">
            <label>Fade Out (smooth end length)</label>

            <slider
              :min="0"
              :max="10"
              :step="0.1"
              :editable="false"
              :label="true"
              :show-completion="true"
              class="mt8"
              :value="fadeOut"
              @input="fadeOut = $event"
              @reset="fadeOut = 1"
            ></slider>
          </div>
        </div>

        <div class="column mb16">
          <div class="form-group -fill">
            <label>Start Gain (before fadeIn)</label>

            <slider
              :min="0.0001"
              :max="1"
              :step="0.001"
              :editable="false"
              :label="true"
              :show-completion="true"
              class="mt8"
              :value="startGain"
              @input="startGain = $event"
              @reset="startGain = 0.001"
            ></slider>
          </div>

          <div class="ml8 form-group -fill">
            <label>End Gain (after fadeOut)</label>

            <slider
              :min="0.0001"
              :max="1"
              :step="0.001"
              :editable="false"
              :label="true"
              :show-completion="true"
              class="mt8"
              :value="endGain"
              @input="endGain = $event"
              @reset="endGain = 0.001"
            ></slider>
          </div>
        </div>

        <div class="form-group mb16">
          <label>Delay (wait n seconds before play)</label>

          <slider
            :min="0"
            :max="10"
            :step="0.1"
            :editable="false"
            :label="true"
            :show-completion="true"
            class="mt8"
            :value="delay"
            @input="delay = $event"
            @reset="delay = 0"
          ></slider>
        </div>
      </div>

      <div class="section__title" @click="showAdvanced = !showAdvanced">
        Advanced
        <i class="icon-up"></i>
      </div>
    </section>

    <div class="form-group mt16">
      <label for="audio-assistant-output">
        Output
      </label>
      <div class="d-flex">
        <textarea
          id="audio-assistant-output"
          cols="20"
          rows="4"
          ref="output"
          class="form-control"
          :value="litteral"
          spellcheck="false"
          readonly
        ></textarea>
        <button class="btn -red ml8" @click="$emit('test', { event: $event, litteral: litteral })">
          <i class="icon-volume-high"></i>
        </button>
      </div>

      <p v-if="error" class="form-feedback"><i class="icon-warning mr4"></i> {{ error }}</p>
    </div>
    <footer>
      <a href="javascript:void(0);" class="btn -text mrauto" @click="$emit('stop')" v-tippy title="Clear queued sounds">Stop all</a>
      <a href="javascript:void(0);" class="btn -text mr8" @click="close(false)">Cancel</a>
      <button class="btn -large" @click="submit"><i class="icon-check mr4"></i> Ok</button>
    </footer>
  </Dialog>
</template>

<script>
import DialogMixin from '../../mixins/dialogMixin'
import Slider from '../framework/picker/Slider.vue'
import importService from '@/services/importService'
import workspacesService from '@/services/workspacesService'

const DEFAULT_INSTRUCTION_ARGUMENTS = {
  synth: {
    frequency: 329.63,
    gain: 1,
    fadeOut: 1,
    delay: null,
    fadeIn: 0,
    holdDuration: 0,
    osc: 'triangle',
    startGain: 0.001,
    endGain: 0.001,
    startTime: 0
  },
  file: {
    url: null,
    gain: 1,
    holdDuration: 1,
    delay: null,
    startTime: 0,
    fadeIn: 0,
    fadeOut: 0,
    startGain: 0.00001,
    endGain: 0.00001
  }
}

const DYNAMIC_GAIN_PROPERTIES = ['gain']
const DYNAMIC_LENGTH_PROPERTIES = ['holdDuration', 'fadeIn', 'fadeOut']
export default {
  components: {
    Slider
  },
  props: {
    type: {
      required: true,
      type: String
    },
    error: {
      required: false,
      type: String
    }
  },
  mixins: [DialogMixin],
  data: () => ({
    url: null,
    frequencyInput: null,
    gain: null,
    fadeOut: null,
    delay: null,
    fadeIn: null,
    holdDuration: null,
    osc: null,
    startGain: null,
    endGain: null,
    startTime: null,
    dynamicGain: true,
    dynamicLength: true,
    uploadedSound: null,
    showAdvanced: false
  }),
  computed: {
    title() {
      return this.type === 'synth' ? 'Synthetize sound' : 'Import your own'
    },
    frequency() {
      if (isNaN(this.frequencyInput)) {
        return this.noteToFrequency(this.frequencyInput)
      }

      return +this.frequencyInput
    },
    litteral() {
      const defaultAudioAttributes = DEFAULT_INSTRUCTION_ARGUMENTS[this.type]
      const keys = Object.keys(defaultAudioAttributes)

      const args = keys.map(key => {
        if (
          (this.dynamicGain && DYNAMIC_GAIN_PROPERTIES.indexOf(key) !== -1) ||
          (this.dynamicLength && DYNAMIC_LENGTH_PROPERTIES.indexOf(key) !== -1)
        ) {
          return this[key] ? 'gain*' + this[key] : 0 != defaultAudioAttributes[key] ? 0 : null
        } else {
          return this[key] != defaultAudioAttributes[key] ? this[key] : null
        }
      })

      for (let i = args.length - 1; i >= 0; i--) {
        if (args[i] === null) {
          args.splice(i, 1)
        } else {
          break
        }
      }

      return `${this.type === 'synth' ? 'play' : 'playurl'}(${args.map(a => (a === null ? '' : a))})`
    }
  },
  created() {
    this.setDefaultAudioAttributes()
  },
  beforeDestroy() {
    if (this.uploadedSound) {
      workspacesService.removeSound(this.uploadedSound).then(() => {
        this.$store.dispatch('app/showNotice', {
          title: `Deleted ${this.uploadedSound} (canceled)`,
          type: 'info'
        })
      })
    }
  },
  methods: {
    setDefaultAudioAttributes() {
      const defaultAudioAttributes = DEFAULT_INSTRUCTION_ARGUMENTS[this.type]

      for (const key in defaultAudioAttributes) {
        this[key] = defaultAudioAttributes[key]
      }
    },
    noteToFrequency(note) {
      const notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']
      let octave
      let keyNumber

      if (note.length === 3) {
        octave = note.charAt(2)
      } else {
        octave = note.charAt(1)
      }

      keyNumber = notes.indexOf(note.slice(0, -1))

      if (keyNumber < 3) {
        keyNumber = keyNumber + 12 + (octave - 1) * 12 + 1
      } else {
        keyNumber = keyNumber + (octave - 1) * 12 + 1
      }

      // Return frequency of note
      return 440 * Math.pow(2, (keyNumber - 49) / 12)
    },
    async handleFile(event) {
      const file = event.target.files[0]

      if (!file) {
        return
      }

      try {
        const uploadedSound = await importService.importSound(file)

        if (uploadedSound) {
          if (this.uploadedSound) {
            workspacesService.removeSound(this.uploadedSound)
          }

          this.uploadedSound = this.url = uploadedSound.name
        } else {
          this.url = file.name
        }
      } catch (error) {
        this.$store.dispatch('app/showNotice', {
          title: error.message,
          type: 'error'
        })
        return
      }
    },
    submit() {
      this.$emit('append', { litteral: this.litteral, uploadedSound: this.uploadedSound })

      this.uploadedSound = null

      this.close()
    }
  }
}
</script>

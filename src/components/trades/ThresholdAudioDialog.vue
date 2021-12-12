<template>
  <Dialog @clickOutside="close" class="pane-dialog -auto" @mousedown="clickOutsideClose = false" @mouseup="clickOutsideClose = true">
    <template v-slot:header>
      <div>
        <div class="title">
          <div>Threshold</div>
        </div>

        <div class="subtitle">{{ thresholdId }} {{ formatAmount(threshold.amount) }}</div>
      </div>
    </template>
    <div class="d-flex mb16">
      <p class="help-text mx0 -center">
        <i class="icon-info mr4"></i><span v-text="`Play a song when a ${formatAmount(this.min)} - ${formatAmount(this.max)} trade occur.`"></span>
      </p>
      <button class="btn -text mlauto" @click="showHelp = !showHelp"><i class="icon-down" :class="{ 'icon-up': this.showHelp }"></i> help</button>
    </div>
    <div class="help-block mb16" v-if="showHelp">
      Write a sequence of sounds using the play() or playurl() function

      <blockquote>
        play(<br /><span class="ml8" v-tippy title="Frequency (hz)"><code class="-filled">frequency</code>: number</span>,<br />
        <span class="ml8" v-tippy title="Gain (volume, 0 is muted and 1 is max, anything above 1 will sound saturated)"
          ><code class="-filled">gain</code>: number</span
        >,<br />
        <span class="ml8" v-tippy title="FadeOut (gain to endGain duration)"><code class="-filled">fadeOut</code>: number</span>,<br />
        <span class="ml8" v-tippy title="Delay song by n second"><code class="-filled">delay</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="FadeIn (startGain to gain duration)"><code class="-filled">fadeIn</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="HoldDuration (time at gain)"><code class="-filled">holdDuration</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="Oscillator (type of wave, either sine, square, triangle, or sawtooth)"
          ><code class="-filled">osc</code>?: number</span
        >,<br />
        <span class="ml8" v-tippy title="StartGain (cannot be 0, but should be close to 0 like 0.0001)"
          ><code class="-filled">startGain</code>?: number</span
        >,<br />
        <span class="ml8" v-tippy title="EndGain (cannot be 0, but should be close to 0 like 0.0001)"
          ><code class="-filled">endGain</code>?: number</span
        ><br />
        )
      </blockquote>

      <blockquote>
        playurl(<br /><span class="ml8" v-tippy title="URL (.mp3|.wav|.ogg) (https://archive.org/details/audio)"
          ><code class="-filled">url</code>: string</span
        >,<br />
        <span class="ml8" v-tippy title="Gain (volume, 0 is muted and 1 is max, anything above 1 will sound saturated)"
          ><code class="-filled">gain</code>: number</span
        >,<br />
        <span class="ml8" v-tippy title="HoldDuration (time at gain)"><code class="-filled">holdDuration</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="Delay song by n second"><code class="-filled">delay</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="StartTime (start audio at 'x' seconds)"><code class="-filled">startTime</code>: number</span>,<br />
        <span class="ml8" v-tippy title="FadeIn (startGain to gain duration)"><code class="-filled">fadeIn</code>?: number</span>,<br />
        <span class="ml8" v-tippy title="FadeOut (gain to endGain duration)"><code class="-filled">fadeOut</code>: number</span>,<br />
        <span class="ml8" v-tippy title="StartGain (cannot be 0, but should be close to 0 like 0.0001)"
          ><code class="-filled">startGain</code>?: number</span
        >,<br />
        <span class="ml8" v-tippy title="EndGain (cannot be 0, but should be close to 0 like 0.0001)"
          ><code class="-filled">endGain</code>?: number</span
        ><br />
        )
      </blockquote>
    </div>
    <div class="form-group mb16">
      <label for>
        When buy
      </label>
      <div class="d-flex">
        <button v-if="buyAudio !== threshold.buyAudio" class="btn -green mr8" @click="testOriginal('buy', $event)" title="Original" v-tippy>
          <i class="icon-volume-high"></i>
        </button>
        <textarea
          cols="20"
          rows="4"
          ref="behaveBuy"
          class="form-control"
          :value="buyAudio"
          @blur="setInput($event.target.value, 'buy')"
          spellcheck="false"
          @focus="focusedSide = 'buy'"
        ></textarea>
        <button class="btn -green ml8" @click="testCustom('buy', $event)" @dblclick="doTheLoop('buy')" title="Custom">
          <i class="icon-volume-high"></i>
        </button>
      </div>

      <div v-if="focusedSide === 'buy'" class="mt8 d-flex">
        <button class="btn -small -accent" @click="openSoundAssistant('synth', 'buy')"><i class="icon-plus mr8"></i> Synthetize sound</button>
        <button class="btn -small -accent ml8" @click="openSoundAssistant('file', 'buy')"><i class="icon-plus mr8"></i> Use sound file</button>
        <button class="btn -small -red mlauto -text" @click="reset('buy')"><i class="icon-eraser mr8"></i> Reset</button>
      </div>

      <p v-if="buyError" class="form-feedback"><i class="icon-warning mr4"></i> {{ buyError }}</p>
    </div>
    <div class="form-group mb16">
      <label for>
        When sell
      </label>
      <div class="d-flex">
        <button v-if="sellAudio !== threshold.sellAudio" class="btn -red mr8" @click="testOriginal('sell', $event)" title="Original" v-tippy>
          <i class="icon-volume-high"></i>
        </button>
        <textarea
          cols="20"
          rows="4"
          ref="behaveSell"
          class="form-control"
          :value="sellAudio"
          @blur="setInput($event.target.value, 'sell')"
          spellcheck="false"
          @focus="focusedSide = 'sell'"
        ></textarea>
        <button class="btn -red ml8" @click="testCustom('sell', $event)" @dblclick="doTheLoop('sell')">
          <i class="icon-volume-high"></i>
        </button>
      </div>

      <div v-if="focusedSide === 'sell'" class="mt8 d-flex">
        <button class="btn -small -accent" @click="openSoundAssistant('synth', 'sell')">Synthetize sound</button>
        <button class="btn -small -accent ml8" @click="openSoundAssistant('file', 'sell')">Use sound file</button>
        <button class="btn -small -red mlauto -text" @click="reset('sell')"><i class="icon-eraser mr8"></i> Reset</button>
      </div>

      <p v-if="sellError" class="form-feedback"><i class="icon-warning mr4"></i> {{ sellError }}</p>
    </div>
    <footer>
      <a href="javascript:void(0);" class="btn -text mrauto" @click="restartWebAudio()" v-tippy title="Clear queued sounds">Stop all</a>
      <a href="javascript:void(0);" class="btn -text mr8" @click="close(false)">Cancel</a>
      <button class="btn -large" @click="saveInputs()"><i class="icon-check mr4"></i> Save</button>
    </footer>
  </Dialog>
</template>

<script>
import DialogMixin from '../../mixins/dialogMixin'
import Behave from 'behave-js'
import { formatAmount } from '@/utils/helpers'
import audioService from '@/services/audioService'
import dialogService from '@/services/dialogService'
import AudioAssistantDialog from './AudioAssistantDialog.vue'
import panesSettings from '@/store/panesSettings'

export default {
  props: {
    paneId: {
      required: true,
      type: String
    },
    thresholds: {
      required: true
    },
    thresholdId: {
      required: true,
      type: String
    }
  },
  mixins: [DialogMixin],
  data: () => ({
    buyAudio: '',
    sellAudio: '',
    buyError: null,
    sellError: null,
    showHelp: false,
    focusedSide: null
  }),
  computed: {
    threshold: function() {
      return this.thresholds.find(t => t.id === this.thresholdId)
    },
    amounts: function() {
      return this.thresholds.map(t => t.amount)
    },
    audioPitch: function() {
      return this.$store.state[this.paneId].audioPitch
    },
    audioVolume: function() {
      return this.$store.state[this.paneId].audioVolume
    },
    index: function() {
      return this.amounts.indexOf(this.threshold.amount)
    },
    min: function() {
      return this.threshold.amount
    },
    max: function() {
      return this.amounts[this.index + 1] || this.amounts[this.index] * 2
    }
  },
  created() {
    this._behaves = []

    if (!this.threshold) {
      return this.$nextTick(() => this.close(false))
    }

    this.buyAudio = this.threshold.buyAudio || ''
    this.sellAudio = this.threshold.sellAudio || ''
  },
  mounted() {
    this.$nextTick(() => this.initBehave())
  },
  beforeDestroy() {
    if (this.looping) {
      clearTimeout(this.looping)
      this.looping = false
    }

    for (const behave of this._behaves) {
      behave.destroy()
    }
  },
  methods: {
    setInput(input, side) {
      this[side + 'Audio'] = input
    },
    saveInputs() {
      if (!this.validate(true)) {
        return
      }

      this.$store.commit(this.paneId + '/SET_THRESHOLD_AUDIO', {
        id: this.thresholdId,
        buyAudio: this.buyAudio,
        sellAudio: this.sellAudio
      })

      this.close(true)
    },
    validate(alert = false) {
      for (const side of ['buy', 'sell']) {
        const litteral = this[side + 'Audio']

        try {
          this.emulateAudioFunction(litteral, side)
        } catch (error) {
          if (alert) {
            dialogService.confirm({
              message: `Please check that ${side} audio script is syntactically correct.`,
              ok: 'OK',
              cancel: false
            })
          }

          return false
        }
      }

      return true
    },
    async testCustom(side, event, litteral) {
      if (this.looping) {
        clearTimeout(this.looping)
        this.looping = false
      }

      if (!litteral) {
        litteral = this[side + 'Audio']
      }

      return await this.test(litteral, side, event)
    },
    testOriginal(side, event) {
      if (this.looping) {
        clearTimeout(this.looping)
        this.looping = false
      }

      const litteral = this.threshold[side + 'Audio']

      this.test(litteral, side, event)
    },
    doTheLoop(side) {
      this.looping = setTimeout(() => {
        this.test(this.threshold[side + 'Audio'], side)

        this.doTheLoop(side)
      }, Math.random() * 100)
    },
    restartWebAudio() {
      audioService.reconnect()
    },
    async test(litteral, side, event) {
      let percent = 1
      let amount

      const range = this.max - this.min

      if ((event && event.shiftKey) || !range) {
        amount = this.min
      } else {
        amount = this.min + Math.random() * range
        percent = amount / this.amounts[1]
      }

      if (amount) {
        const success = await this.emulateAudioFunction(litteral, side, percent)

        if (success && event) {
          this.$store.dispatch('app/showNotice', {
            id: 'testing-threshold-audio',
            type: side === 'buy' ? 'success' : 'error',
            title: 'NOW PLAYING : ' + formatAmount(amount) + ' ' + side.toUpperCase() + ' trade',
            timeout: 1000
          })
        }

        return success
      }
    },
    formatAmount(amount) {
      return formatAmount(amount)
    },
    async emulateAudioFunction(litteral, side, percent) {
      try {
        const adapter = await audioService.buildAudioFunction(litteral, side, this.audioPitch, this.audioVolume, true)

        if (typeof percent !== 'undefined') {
          adapter(audioService, percent, side, this.index)
        }

        this[side + 'Error'] = null

        return true
      } catch (error) {
        this[side + 'Error'] = error.message

        return false
      }
    },
    initBehave() {
      for (const el of [this.$refs.behaveBuy, this.$refs.behaveSell]) {
        this._behaves.push(
          new Behave({
            textarea: el,
            replaceTab: true,
            softTabs: true,
            tabSize: 2,
            autoOpen: true,
            overwrite: true,
            autoStrip: true,
            autoIndent: true,
            fence: false
          })
        )
      }
    },
    openSoundAssistant(type, side) {
      const dialog = dialogService.open(AudioAssistantDialog, {
        type,
        error: this[side + 'Error']
      })

      dialog.$on('test', ({ event, litteral }) => this.testCustom(side, event, litteral))

      dialog.$on('append', ({ litteral, uploadedSound }) => {
        if (uploadedSound) {
          this.uploadedSounds.push(uploadedSound)
        }

        if (this[side + 'Audio'].trim().length) {
          this[side + 'Audio'] += `\n${litteral}`
        } else {
          this[side + 'Audio'] = litteral
        }
      })
    },
    reset(side) {
      const defaultSettings = JSON.parse(JSON.stringify(panesSettings[this.$store.state.panes.panes[this.paneId].type].state))

      if (defaultSettings.thresholds[Math.min(this.index, 3)]) {
        this[side + 'Audio'] = defaultSettings.thresholds[Math.min(this.index, 3)][side + 'Audio']
      }
    }
  }
}
</script>

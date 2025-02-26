<template>
  <div
    :contenteditable="editable !== false"
    :disabled="editable === false"
    @keydown="onKeyDown"
    @input="changed = true"
    @focus="onFocus"
    @blur="onBlur"
    @click="onClick"
    @wheel="onWheel"
  ></div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator'

import { countDecimals } from '../../utils/helpers'
@Component({
  name: 'Editable',
  props: ['content', 'step', 'min', 'max', 'editable', 'disabled']
})
export default class extends Vue {
  private content: string
  private step: number
  private min: number
  private max: number
  private editable: boolean
  private disabled: boolean
  private clickAt: number
  private changed = false
  private focused = false

  mounted() {
    const el = this.$el as HTMLElement

    el.innerText = this.content
  }

  @Watch('content')
  onContentChange() {
    if ((this.$el as HTMLElement).innerText !== this.content) {
      ;(this.$el as HTMLElement).innerText = this.content
    }
  }

  selectAll() {
    window.setTimeout(() => {
      let sel: Selection
      let range: Range

      if (window.getSelection && document.createRange) {
        range = document.createRange()
        range.selectNodeContents(this.$el)
        sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      } else if ((document.body as any).createTextRange) {
        range = (document.body as any).createTextRange()
        ;(range as any).moveToElementText(this.$el)
        ;(range as any).select()
      }
    }, 1)
  }

  onBlur(event) {
    if (event.which === 13 && !isNaN(event.target.innerText)) {
      event.preventDefault()
      return
    }

    this.changed && this.$emit('output', event.target.innerText)
    this.focused = false

    if (window.getSelection) {
      window.getSelection().removeAllRanges()
    } else if ((document as any).selection) {
      ;(document as any).selection.empty()
    }
  }

  onKeyDown(event) {
    if (this.disabled || event.which === 13) {
      event.preventDefault()
      ;(this.$el as HTMLInputElement).blur()

      event.target.innerText = this.content

      return
    }

    if (event.which === 38 || event.which === 40) {
      this.crement((event.which === 40 ? 1 : -1) * (event.shiftKey ? 100 : 1))
    }
  }

  onFocus() {
    // !this.focused && this.selectAll()

    this.changed = false
    this.focused = true
  }

  onClick() {
    const now = Date.now()

    if (this.clickAt && now - this.clickAt < 150) {
      this.selectAll()
    }

    this.clickAt = now
  }

  crement(direction: number) {
    const text = (this.$el as HTMLElement).innerText.replace(/[^0-9-.]/g, '')

    if (isNaN(text as any)) {
      return
    }

    const max = typeof this.max === 'undefined' ? Infinity : this.max
    const min = typeof this.min === 'undefined' ? 0 : this.min
    const step = this.step || 1
    const precision = countDecimals(step)
    const change = step * direction * -1
    const value = +Math.max(min, Math.min(max, +text + change)).toFixed(precision)

    this.$emit('output', value)
  }

  onWheel(event) {
    if (!(document.activeElement as HTMLElement).isContentEditable) {
      return
    }

    event.preventDefault()

    this.crement(Math.sign(event.deltaY) * (event.shiftKey ? 10 : 1))
  }
}
</script>

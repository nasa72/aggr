<template>
  <div class="pane-trades hide-scrollbar" :class="{ '-logos': this.showLogos, '-logos-colors': !this.monochromeLogos }">
    <pane-header :paneId="paneId" />
    <table>
      <tbody ref="tradesContainer"></tbody>
    </table>
    <trades-placeholder v-if="showPlaceholder" :paneId="paneId"></trades-placeholder>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'

import { formatPrice, formatAmount, parseMarket } from '@/utils/helpers'
import { getColorByWeight, getColorLuminance, getAppBackgroundColor, splitRgba } from '@/utils/colors'
import { SlippageMode, Trade } from '@/types/test'
import { Threshold } from '@/store/panesSettings/trades'
import { waitForStateMutation } from '@/utils/store'

import aggregatorService from '@/services/aggregatorService'
import gifsService from '@/services/gifsService'
import audioService, { AudioFunction } from '@/services/audioService'
import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '@/components/panes/PaneHeader.vue'
import TradesPlaceholder from '@/components/trades/TradesPlaceholder.vue'

interface TradesPaneCache {
  showTrades?: boolean
  showLiquidations?: boolean
  slippageMode?: SlippageMode
  showGifs?: boolean
  showLogos?: boolean
  showTradesPairs?: boolean
  marketsMultipliers?: { [identifier: string]: number }
  paneMarkets?: { [identifier: string]: boolean }

  tradesAudios?: PreparedAudioStep[]
  tradesColors?: PreparedColorStep[]
  minimumTradeAmount?: number
  significantTradeAmount?: number

  liquidationsAudios?: PreparedAudioStep[]
  liquidationsColors?: PreparedColorStep[]
  minimumLiquidationAmount?: number
  significantLiquidationAmount?: number

  audioThreshold?: number
}

interface PreparedColorStep {
  min?: number
  max?: number
  range?: number
  buy: {
    from: number[]
    to: number[]
    fromLuminance: number
    toLuminance: number
    gif: string
  }
  sell: {
    from: number[]
    to: number[]
    fromLuminance: number
    toLuminance: number
    gif: string
  }
}

interface PreparedAudioStep {
  buy: AudioFunction
  sell: AudioFunction
}

@Component({
  components: { PaneHeader, TradesPlaceholder },
  name: 'Trades'
})
export default class extends Mixins(PaneMixin) {
  showPlaceholder = true

  private _onStoreMutation: () => void
  private _timeAgoInterval: number
  private _tradesCount = 0
  private _lastTradeTimestamp: number
  private _lastSide: 'buy' | 'sell'

  private _preferences: TradesPaneCache

  get maxRows() {
    return this.$store.state[this.paneId].maxRows
  }

  get tradesThresholds(): Threshold[] {
    return this.$store.state[this.paneId].thresholds
  }

  get liquidationsThresholds(): Threshold[] {
    return this.$store.state[this.paneId].liquidations
  }

  get tradeType() {
    return this.$store.state[this.paneId].tradeType
  }

  get showTradesPairs() {
    return this.$store.state[this.paneId].showTradesPairs
  }

  get showLogos() {
    return this.$store.state[this.paneId].showLogos
  }

  get monochromeLogos() {
    return this.$store.state[this.paneId].monochromeLogos
  }

  get exchanges() {
    return this.$store.state.exchanges
  }

  get audioThreshold() {
    return this.$store.state[this.paneId].audioThreshold
  }

  $refs!: {
    tradesContainer: HTMLElement
  }

  created() {
    this._tradesCount = 0

    this.cachePreferences()
    this.cachePaneMarkets()
    this.loadGifs()
    this.prepareColors()
    this.prepareAudio()

    aggregatorService.on('trades', this.onTrades)

    this._onStoreMutation = this.$store.subscribe(mutation => {
      switch (mutation.type) {
        case 'app/EXCHANGE_UPDATED':
        case 'settings/TOGGLE_SLIPPAGE':
        case this.paneId + '/SET_THRESHOLD_MULTIPLIER':
        case this.paneId + '/TOGGLE_TRADE_TYPE':
          this.cachePreferences()
          break
        case this.paneId + '/SET_MAX_ROWS':
          this.trimRows()
          break
        case 'panes/SET_PANE_MARKETS':
          if (mutation.payload.id === this.paneId) {
            this.cachePaneMarkets()
            this.refreshList()
          }
          break
        case this.paneId + '/SET_THRESHOLD_GIF':
          gifsService.getGifs(mutation.payload.value)
          this.refreshList()
          break
        case this.paneId + '/SET_THRESHOLD_AUDIO':
        case 'settings/TOGGLE_AUDIO':
          this.prepareAudio()
          break
        case this.paneId + '/SET_AUDIO_PITCH':
        case this.paneId + '/SET_AUDIO_VOLUME':
        case 'settings/SET_AUDIO_VOLUME':
          this.prepareAudio(false)
          break
        case 'settings/SET_CHART_BACKGROUND_COLOR':
        case this.paneId + '/SET_THRESHOLD_COLOR':
        case this.paneId + '/SET_THRESHOLD_AMOUNT':
        case this.paneId + '/DELETE_THRESHOLD':
        case this.paneId + '/ADD_THRESHOLD':
          this.prepareColors()
          this.refreshList()

          if (mutation.type === this.paneId + '/DELETE_THRESHOLD' || this.paneId + '/ADD_THRESHOLD') {
            this.prepareAudio()
          }
          break
        case this.paneId + '/SET_AUDIO_THRESHOLD':
        case this.paneId + '/TOGGLE_MUTED':
          this.prepareAudioThreshold()
          break
      }
    })
  }
  mounted() {
    this.startTimeAgoInterval()
  }

  beforeDestroy() {
    aggregatorService.off('trades', this.onTrades)

    this._onStoreMutation()

    clearInterval(this._timeAgoInterval)
  }

  startTimeAgoInterval() {
    let now

    const timeAgo = milliseconds => {
      if (milliseconds < 60000) {
        return Math.floor(milliseconds / 1000) + 's'
      } else if (milliseconds < 3600000) {
        return Math.floor(milliseconds / 60000) + 'm'
      } else {
        return Math.floor(milliseconds / 3600000) + 'h'
      }
    }

    this._timeAgoInterval = setInterval(() => {
      const elements = this.$el.getElementsByClassName('-timestamp')
      const length = elements.length

      if (!length) {
        return
      }

      now = Date.now()

      const topOfTheMinute = (now / 1000) % 60 < 1

      let previousRowTimeAgo

      for (let i = 0; i < length; i++) {
        if (typeof elements[i] === 'undefined') {
          break
        }

        const milliseconds = now - (elements[i] as any).getAttribute('data-timestamp')
        const txt = timeAgo(milliseconds)

        if (txt === previousRowTimeAgo && txt) {
          elements[i - 1].textContent = ''
          elements[i - 1].className = 'trade__time'
          continue
        }

        if (txt != elements[i].textContent) {
          elements[i].textContent = txt

          if (!topOfTheMinute && txt[txt.length - 1] !== 's') {
            break
          }
        }

        previousRowTimeAgo = txt
      }
    }, 1000)
  }

  onTrades(trades: Trade[]) {
    let prependHTML = ''

    for (let i = 0; i < trades.length; i++) {
      const identifier = trades[i].exchange + trades[i].pair

      if (!this._preferences.paneMarkets[identifier]) {
        continue
      }

      const trade = trades[i]

      if (this._preferences.marketsMultipliers[identifier]) {
        trade.amount /= this._preferences.marketsMultipliers[identifier]
      }

      if (!trade.liquidation && this._preferences.showTrades) {
        if (trade.amount >= this._preferences.minimumTradeAmount) {
          prependHTML += this.showTrade(
            trade,
            this._preferences.tradesColors,
            this._preferences.tradesAudios,
            this._preferences.significantTradeAmount
          )
        } else if (trade.amount > this._preferences.audioThreshold) {
          this._preferences.tradesAudios[0][trade.side](audioService, trade.amount / this._preferences.significantTradeAmount, trade.side, 0)
        }
      } else if (trade.liquidation && this._preferences.showLiquidations) {
        if (trade.amount >= this._preferences.minimumLiquidationAmount) {
          prependHTML += this.showTrade(
            trade,
            this._preferences.liquidationsColors,
            this._preferences.liquidationsAudios,
            this._preferences.significantLiquidationAmount
          )
        } else if (trade.amount > this._preferences.audioThreshold) {
          this._preferences.liquidationsAudios[0][trade.side](
            audioService,
            trade.amount / this._preferences.significantLiquidationAmount,
            trade.side,
            0
          )
        }
      }
    }

    this.$refs.tradesContainer.insertAdjacentHTML('afterbegin', prependHTML)

    if (this._tradesCount > this.maxRows) {
      this._tradesCount--
      this.$refs.tradesContainer.removeChild(this.$refs.tradesContainer.lastChild)
    }
  }

  getTradeInlineStyles(trade: Trade, colorStep: PreparedColorStep, significantAmount: number) {
    const percentToNextThreshold = (Math.max(trade.amount, colorStep.min) - colorStep.min) / colorStep.range
    const percentToSignificant = Math.min(1, trade.amount / significantAmount)

    const colorBySide = colorStep[trade.side]

    // 0-255 luminance of nearest color
    const luminance = colorBySide[(percentToNextThreshold < 0.5 ? 'from' : 'to') + 'Luminance']

    // background color simple color to color based on percentage of amount to next threshold
    const backgroundColor = getColorByWeight(colorBySide.from, colorBySide.to, percentToNextThreshold)

    // take background color and apply logarithmic shade based on amount to this._significantThresholdAmount percentage
    // darken if luminance of background is high, lighten otherwise
    let foregroundColor

    if (luminance > 170) {
      foregroundColor = 'rgba(0, 0, 0, ' + Math.min(1, 0.33 + percentToSignificant) + ')'
    } else {
      foregroundColor = 'rgba(255, 255, 255, ' + Math.min(1, 0.33 + percentToSignificant) + ')'
    }

    let backgroundGif = ''

    if (this._preferences.showGifs && colorStep[trade.side].gif) {
      const keyword = colorStep[trade.side].gif

      if (gifsService.cache[keyword]) {
        backgroundGif = `background-image:url('${gifsService.cache[keyword][Math.floor(Math.random() * (gifsService.cache[keyword].length - 1))]}')`
      }
    }

    return `background-color:rgb(${backgroundColor[0]}, ${backgroundColor[1]}, ${backgroundColor[2]});color:${foregroundColor};${backgroundGif}`
  }

  showTrade(trade: Trade, colors: PreparedColorStep[], audios: PreparedAudioStep[], significantAmount: number) {
    if (!this._tradesCount++) {
      this.showPlaceholder = false
    }

    let level = 0
    let colorStep: PreparedColorStep

    for (level = 0; level < colors.length; level++) {
      if (trade.amount < colors[level].max) {
        colorStep = colors[level]
        break
      }
    }

    if (trade.amount > this._preferences.audioThreshold) {
      audios[level][trade.side](audioService, trade.amount / significantAmount, trade.side, 0)
    }

    return this.renderRow(trade, colorStep, level, significantAmount)
  }

  renderRow(trade: Trade, colorStep: PreparedColorStep, level: number, significantAmount: number) {
    let timestampClass = ''

    if (trade.timestamp !== this._lastTradeTimestamp) {
      timestampClass = ' -timestamp'

      this._lastTradeTimestamp = trade.timestamp
    }

    let priceSlippage = ''

    if (this._preferences.slippageMode && trade.slippage) {
      priceSlippage = `<small>${trade.slippage > 0 ? '+' : ''}${trade.slippage}${this._preferences.slippageMode === 'bps' ? 'bps' : ''}</small>`
    }

    let exchangeName = ''

    if (!this._preferences.showLogos) {
      exchangeName = trade.exchange.replace('_', ' ')
    }

    let sideClass = ''

    if (trade.side !== this._lastSide) {
      sideClass = ' icon-side'
      this._lastSide = trade.side
    }

    let pairName = ''

    if (this._preferences.showTradesPairs) {
      pairName = `<td class="trade__pair">${trade.pair.replace('_', ' ')}</td>`
    }

    return `<tr class="trade -${trade.exchange} -${trade.side} -level-${level}${trade.liquidation ? ' -liquidation' : ''}${
      colorStep[trade.side].gif ? ' -gif' : ''
    }" title="${trade.exchange}:${trade.pair}" style="${this.getTradeInlineStyles(trade, colorStep, significantAmount)}">
    <td class="trade__side${sideClass}"></td>
    <td class="trade__exchange">${exchangeName}</td>
    ${pairName}
    <td class="trade__price">${formatPrice(trade.price)}${priceSlippage}</td>
    <td class="trade__amount">
      <span class="trade__amount__quote">
        <span class="icon-quote"></span>
        <span>${formatAmount(trade.size * trade.price)}</span>
      </span>
      <span class="trade__amount__base">
        <span class="icon-base"></span>
        <span>${formatAmount(trade.size)}</span>
      </span>
    </td>
    <td class="trade__time ${timestampClass}" data-timestamp="${trade.timestamp.toString()}"></td>
    </tr>`
  }

  async loadGifs() {
    this.loadThresholdsGifs(this.tradesThresholds)
    this.loadThresholdsGifs(this.liquidationsThresholds)
  }

  async loadThresholdsGifs(thresholds) {
    for (const threshold of thresholds) {
      if (threshold.buyGif) {
        gifsService.getGifs(threshold.buyGif)
      }

      if (threshold.sellGif) {
        gifsService.getGifs(threshold.sellGif)
      }
    }
  }

  prepareColors() {
    const appBackgroundColor = getAppBackgroundColor()
    this._preferences.tradesColors = this.prepareColorsThresholds(this.tradesThresholds, appBackgroundColor)
    this._preferences.liquidationsColors = this.prepareColorsThresholds(this.liquidationsThresholds, appBackgroundColor)

    this._preferences.minimumTradeAmount = this.tradesThresholds[0].amount
    this._preferences.minimumLiquidationAmount = this.liquidationsThresholds[0].amount
    this._preferences.significantTradeAmount = this.tradesThresholds[1].amount
    this._preferences.significantLiquidationAmount = this.liquidationsThresholds[1].amount
  }

  prepareColorsThresholds(thresholds, appBackgroundColor) {
    const steps = []

    for (let i = 0; i < thresholds.length; i++) {
      if (i === thresholds.length - 1) {
        steps.push({ ...steps[steps.length - 1], max: Infinity })
        break
      }

      const buyFrom = splitRgba(thresholds[i].buyColor, appBackgroundColor)
      const buyTo = splitRgba(thresholds[i + 1].buyColor, appBackgroundColor)
      const sellFrom = splitRgba(thresholds[i].sellColor, appBackgroundColor)
      const sellTo = splitRgba(thresholds[i + 1].sellColor, appBackgroundColor)

      steps.push({
        min: thresholds[i].amount,
        max: thresholds[i + 1].amount,
        range: thresholds[i + 1].amount - thresholds[i].amount,
        buy: {
          from: buyFrom,
          to: buyTo,
          fromLuminance: getColorLuminance(buyFrom),
          toLuminance: getColorLuminance(buyTo),
          gif: thresholds[i].buyColor
        },
        sell: {
          from: sellFrom,
          to: sellTo,
          fromLuminance: getColorLuminance(sellFrom),
          toLuminance: getColorLuminance(sellTo),
          gif: thresholds[i].sellColor
        }
      })
    }

    return steps
  }

  async prepareAudio(prepareThresholds = true) {
    if (!this.$store.state.settings.useAudio || this.$store.state[this.paneId].muted || this.$store.state[this.paneId].audioVolume === 0) {
      this._preferences.audioThreshold = Infinity
      return
    }

    if (this.audioThreshold) {
      if (typeof this.audioThreshold === 'string' && /\d\s*%$/.test(this.audioThreshold)) {
        this._preferences.audioThreshold = this._preferences.minimumTradeAmount * (parseFloat(this.audioThreshold) / 100)
      } else {
        this._preferences.audioThreshold = +this.audioThreshold
      }
    } else {
      this._preferences.audioThreshold = this._preferences.minimumTradeAmount * 0.1
    }

    if (prepareThresholds) {
      const audioPitch = this.$store.state[this.paneId].audioPitch
      const paneVolume = this.$store.state[this.paneId].audioVolume

      this._preferences.tradesAudios = await this.prepareAudioThresholds(this.tradesThresholds, audioPitch, paneVolume)
      this._preferences.liquidationsAudios = await this.prepareAudioThresholds(this.liquidationsThresholds, audioPitch, paneVolume)
    }
  }

  async prepareAudioThresholds(thresholds, audioPitch, paneVolume) {
    const audios = []

    for (let i = 0; i < thresholds.length; i++) {
      audios.push({
        buy: await audioService.buildAudioFunction(thresholds[i].buyAudio, 'buy', audioPitch, paneVolume),
        sell: await audioService.buildAudioFunction(thresholds[i].sellAudio, 'sell', audioPitch, paneVolume)
      })
    }

    return audios
  }

  prepareAudioThreshold() {
    if (!this.$store.state.settings.useAudio || this.$store.state[this.paneId].muted || this.$store.state[this.paneId].audioVolume === 0) {
      this._preferences.audioThreshold = Infinity
      return
    }

    if (this.audioThreshold) {
      if (typeof this.audioThreshold === 'string' && /\d\s*%$/.test(this.audioThreshold)) {
        this._preferences.audioThreshold = this._preferences.minimumTradeAmount * (parseFloat(this.audioThreshold) / 100)
      } else {
        this._preferences.audioThreshold = +this.audioThreshold
      }
    } else {
      this._preferences.audioThreshold = this._preferences.minimumTradeAmount * 0.1
    }
  }

  cachePreferences() {
    if (!this._preferences) {
      this._preferences = {
        paneMarkets: {}
      }
    }

    this._preferences.slippageMode = this.$store.state.settings.calculateSlippage
    this._preferences.showTrades = this.tradeType === 'both' || this.tradeType === 'trades'
    this._preferences.showLiquidations = this.tradeType === 'both' || this.tradeType === 'liquidations'
    this._preferences.showGifs = this.$store.state.settings.disableAnimations
    this._preferences.showLogos = this.showLogos
    this._preferences.showTradesPairs = this.showTradesPairs
  }

  cachePaneMarkets() {
    if (!this.$store.state.app.isExchangesReady) {
      return waitForStateMutation(state => state.app.isExchangesReady).then(this.cachePaneMarkets)
    }

    this._preferences.marketsMultipliers = {}
    this._preferences.paneMarkets = this.$store.state.panes.panes[this.paneId].markets.reduce((output, market) => {
      const identifier = market.replace(':', '')
      const [exchange] = parseMarket(market)

      if (!this.$store.state.app.activeExchanges[exchange]) {
        output[identifier] = false
        return output
      }

      const multiplier = this.$store.state[this.paneId].multipliers[identifier]

      if (multiplier !== 1) {
        this._preferences.marketsMultipliers[identifier] = !isNaN(multiplier) ? multiplier : 0
      }

      output[identifier] = true
      return output
    }, {})
  }

  refreshThresholdsCache() {
    this.prepareColors()
  }

  clearList() {
    this.$refs.tradesContainer.innerHTML = ''
    this._tradesCount = 0
    this.showPlaceholder = true
  }

  refreshList() {
    if (!this._tradesCount) {
      return this.clearList()
    }

    const elements = this.$el.getElementsByClassName('trade')

    const trades: Trade[] = []

    for (const element of elements) {
      const [exchange, pair] = parseMarket(element.getAttribute('title'))

      const timestamp = element.querySelector('.trade__time').getAttribute('timestamp')
      const price = parseFloat((element.querySelector('.trade__price') as HTMLElement).innerText) || 0
      const size = parseFloat((element.querySelector('.trade__amount__base') as HTMLElement).innerText) || 0
      const side: 'buy' | 'sell' = element.classList.contains('-buy') ? 'buy' : 'sell'

      const trade: Trade = {
        timestamp: (timestamp as unknown) as number,
        exchange,
        pair,
        price,
        size,
        side
      }

      if (element.classList.contains('-liquidation')) {
        trade.liquidation = true
      }

      trades.push(trade)
    }

    trades.reverse()

    this.clearList()

    const audioThresholdValue = this._preferences.audioThreshold
    this._preferences.audioThreshold = Infinity
    const showGifsValue = this._preferences.showGifs
    this._preferences.showGifs = false

    this.onTrades(trades)

    this._preferences.audioThreshold = audioThresholdValue
    this._preferences.showGifs = showGifsValue
  }

  trimRows() {
    while (this._tradesCount > this.maxRows) {
      this.$refs.tradesContainer.removeChild(this.$refs.tradesContainer.lastChild)
      this._tradesCount--
    }
  }
}
</script>

<style lang="scss">
.pane-trades {
  font-weight: 400;
  overflow: auto;
  max-height: 100%;

  table {
    border: 0;
    border-collapse: collapse;
    scrollbar-width: none;
    line-height: 1;
    white-space: nowrap;

    td {
      overflow: hidden;
    }
  }

  &.-large {
    font-weight: 500;

    .trade {
      padding-top: 3px;
      padding-bottom: 5px;
    }
  }

  &.-logos {
    .trade__exchange {
      width: 2em;
      max-width: 2em;
      text-align: center;

      &:before {
        font-family: 'icon';
        font-weight: 400;
        font-size: 134%;
      }
    }

    @each $exchange, $icon in $exchanges {
      .-#{$exchange} .trade__exchange:before {
        content: $icon;
      }
    }

    &.-logos-colors {
      .trade__exchange {
        background-repeat: no-repeat;
        background-position: center;
        background-size: 60%;

        &:before {
          display: none;
        }
      }

      @each $exchange, $icon in $exchanges {
        .-#{$exchange} .trade__exchange {
          background-image: url('../../assets/exchanges/#{$exchange}.svg');
        }
      }
    }
  }
}

.trades-placeholder {
  text-align: center;
  overflow: auto;
  max-height: 100%;

  &__market {
    color: var(--theme-color-200);
  }
}

.trade {
  padding: 1px 0 3px;
  position: relative;

  &:after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    background-color: white;
    animation: 0.5s highlight;
    pointer-events: none;
  }

  &__side {
    width: 10%;
    max-width: 10%;
    font-weight: 600;
    text-align: center;
  }

  &__exchange,
  &__pair {
    overflow: hidden;
    width: 20%;
    max-width: 20%;
    font-size: 68.75%;
    white-space: normal;
    line-height: 0.9;
  }

  &__price {
    width: 30%;
    max-width: 30%;

    small {
      font-size: 0.75em;
      font-weight: 400;
      line-height: 1em;
      display: inline-block;
      vertical-align: top;
      padding: 0.2em 0.25em;
    }
  }

  &__time {
    text-align: right;
    padding-right: 0.5em;
    position: absolute;
    padding-right: 0.5em;
    overflow: visible;
    right: 0;
    line-height: 1.4;
  }

  &__amount {
    padding: 0 1px;
    max-width: 33%;
    min-width: 1px;
    overflow: hidden;
    text-overflow: ellipsis;

    .trade__amount__base {
      display: none;
    }

    &:hover {
      > .trade__amount__base {
        display: block;
      }

      > .trade__amount__quote {
        display: none;
      }
    }
  }

  &.-gif {
    background-position: center center;
    background-size: cover;
    background-blend-mode: overlay;
  }

  &.-liquidation {
    .icon-side {
      font-weight: 400;
    }

    &.-buy .icon-side:before {
      content: unicode($icon-bear);
    }

    &.-sell .icon-side:before {
      content: unicode($icon-bull);
    }
  }

  &.-sell .icon-side:before {
    content: unicode($icon-down);
  }

  &.-buy .icon-side:before {
    content: unicode($icon-up);
  }

  &.-level-0 {
    height: 1.5em;
    font-size: 0.875em;
  }

  &.-level-1 {
    height: 1.5em;
    font-size: 1em;
    font-weight: 500;
  }

  &.-level-2 {
    height: 1.6em;
    font-size: 1.2em;
  }

  &.-level-3 {
    height: 2em;
    box-shadow: 0 0 20px rgba(black, 0.5);
    z-index: 1;
    font-size: 1.25em;
    font-weight: 600;
  }

  .icon-side {
    font-family: 'icon';
  }

  .icon-currency,
  .icon-quote,
  .icon-base {
    line-height: 0;
  }
}

#app[data-prefered-sizing-currency='base'] .trade .trade__amount {
  .trade__amount__quote {
    display: none;
  }

  .trade__amount__base {
    display: block;
  }

  &:hover {
    > span.trade__amount__base {
      display: none;
    }

    > span.trade__amount__quote {
      display: block;
    }
  }
}

#app.-light .trade.-level-3 {
  box-shadow: 0 0 20px rgba(white, 0.5);
}
</style>

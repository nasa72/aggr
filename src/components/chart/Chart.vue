<template>
  <div class="pane-chart">
    <pane-header :loading="loading" :paneId="paneId" :controls="paneControls">
      <button v-for="(timeframeLabel, timeframe) of favoriteTimeframes" :key="timeframe" @click="changeTimeframe(timeframe)">
        <span v-text="timeframeLabel"></span>
      </button>
      <dropdown :options="timeframes" :selected="timeframe" placeholder="tf." @output="changeTimeframe($event)" selectionClass="-text -arrow">
        <template v-slot:selection>
          <span>{{ timeframeForHuman }}</span>
        </template>
        <template v-slot:option="{ index, value }">
          <i
            class="-fill icon-star mr4"
            @mousedown.prevent
            :class="{ 'icon-star-filled': favoriteTimeframes[index] }"
            @click="toggleFavoriteTimeframe(index)"
          ></i>

          <span class="mlauto">{{ value }}</span>
        </template>
      </dropdown>
    </pane-header>
    <div class="chart-overlay -left hide-scrollbar">
      <div class="chart-overlay__panel">
        <div class="chart-overlay__content chart__indicators" v-if="showIndicatorsOverlay">
          <IndicatorControl v-for="(indicator, id) in indicators" :key="id" :indicatorId="id" :paneId="paneId" />

          <a href="javascript:void(0);" @click="addIndicator" class="btn mt8 mb8 -text"> Add <i class="icon-plus ml8 "></i> </a>
        </div>
        <div class="chart-overlay__title pane-overlay" @click="toggleIndicatorOverlay">Indicators <i class="icon-up -higher"></i></div>
      </div>

      <div class="chart-overlay__panel chart__markets">
        <div class="chart-overlay__content pane-overlay" v-if="showMarketsOverlay">
          <div class="column">
            <a href="javascript:void(0)" class="btn -text" @click="toggleMarkets('perp')">perp</a>
            <i class="pipe -center">|</i>
            <a href="javascript:void(0)" class="btn -text" @click="toggleMarkets('spot')">spot</a>
            <i class="pipe -center">|</i>
            <a href="javascript:void(0)" class="btn -text" @click="toggleMarkets('all')">all</a>
          </div>
          <div v-for="market of markets" :key="market" @click="toggleMarket($event, market)">
            <label class="checkbox-control -small mb4">
              <input
                type="checkbox"
                class="form-control"
                :checked="!hiddenMarkets[market]"
                @change="toggleMarket($event, market)"
                @click.prevent="toggleMarket($event, market)"
              />
              <div></div>
              <span v-text="market"></span>
            </label>
          </div>
        </div>
        <div class="chart-overlay__title pane-overlay" @click="showMarketsOverlay = !showMarketsOverlay">Markets <i class="icon-up -higher"></i></div>
      </div>
    </div>
    <div class="chart-overlay -right chart__controls" :style="{ marginRight: axis[0] + 'px' }">
      <button class="chart__screenshot btn -text -large" @click="takeScreenshot"><i class="icon-add-photo"></i></button>
    </div>
    <div class="chart__container" ref="chartContainer">
      <chart-layout v-if="layouting" :pane-id="paneId" :layouting="layouting" :axis="axis"></chart-layout>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'

import ChartController, { TimeRange } from './chartController'

import {
  formatPrice,
  formatAmount,
  getHms,
  formatBytes,
  openBase64InNewTab,
  getTimeframeForHuman,
  floorTimestampToTimeframe
} from '../../utils/helpers'
import { MAX_BARS_PER_CHUNKS } from '../../utils/constants'
import { getCustomColorsOptions } from './chartOptions'

import aggregatorService from '@/services/aggregatorService'
import historicalService, { HistoricalResponse } from '@/services/historicalService'
import dialogService from '../../services/dialogService'

import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '../panes/PaneHeader.vue'
import IndicatorControl from './IndicatorControl.vue'
import ChartLayout from './ChartLayout.vue'
import CreateIndicatorDialog from './CreateIndicatorDialog.vue'
import { ChartPaneState } from '@/store/panesSettings/chart'
import { getColorLuminance, joinRgba, splitRgba } from '@/utils/colors'

@Component({
  name: 'Chart',
  components: {
    IndicatorControl,
    ChartLayout,
    PaneHeader
  }
})
export default class extends Mixins(PaneMixin) {
  loading = false
  axis = [null, null]

  timeframes = {
    '21t': '21 ticks',
    '50t': '50 ticks',
    '89t': '89 ticks',
    '100t': '100 ticks',
    '144t': '144 ticks',
    '200t': '200 ticks',
    '233t': '233 ticks',
    '377t': '377 ticks',
    '610t': '610 ticks',
    '1000t': '1000 ticks',
    '1597t': '1597 ticks',
    1: '1s',
    3: '3s',
    5: '5s',
    10: '10s',
    15: '15s',
    30: '30s',
    60: '1m',
    [60 * 3]: '3m',
    [60 * 5]: '5m',
    [60 * 15]: '15m',
    [60 * 21]: '21m',
    [60 * 30]: '30m',
    [60 * 60]: '1h',
    [60 * 60 * 2]: '2h',
    [60 * 60 * 4]: '4h',
    [60 * 60 * 6]: '6h',
    [60 * 60 * 8]: '8h',
    [60 * 60 * 12]: '12h',
    [60 * 60 * 24]: '1d'
  }

  showMarketsOverlay = false
  showIndicatorsOverlay = false

  paneControls = [
    {
      icon: 'resize-height',
      label: 'Move indicators',
      click: this.toggleLayout
    },
    {
      icon: 'refresh',
      label: 'Force refresh',
      click: this.resetChart
    }
  ]

  private _onStoreMutation: () => void
  private _keepAliveTimeout: number
  private _onPanTimeout: number
  private _chartController: ChartController
  private _legendElements: { [id: string]: HTMLElement }
  private _lastCoordinates: number
  private _reachedEnd: boolean

  get indicators() {
    return (this.$store.state[this.paneId] as ChartPaneState).indicators
  }

  get layouting() {
    return (this.$store.state[this.paneId] as ChartPaneState).layouting
  }

  get showLegend() {
    return (this.$store.state[this.paneId] as ChartPaneState).showLegend
  }

  get favoriteTimeframes() {
    return this.$store.state.settings.favoriteTimeframes
  }

  get timeframe() {
    return this.$store.state[this.paneId].timeframe
  }

  get timeframeForHuman() {
    return getTimeframeForHuman(this.timeframe, true)
  }

  get markets() {
    return this.$store.state.panes.panes[this.paneId].markets
  }

  get hiddenMarkets() {
    return this.$store.state[this.paneId].hiddenMarkets
  }

  $refs!: {
    chartContainer: HTMLElement
  }

  created() {
    this._chartController = new ChartController(this.paneId)

    this._legendElements = {}

    this._onStoreMutation = this.$store.subscribe(mutation => {
      switch (mutation.type) {
        case 'settings/SET_CHART_COLOR':
          if (mutation.payload) {
            this._chartController.chartInstance.applyOptions(getCustomColorsOptions(mutation.payload))
          }
          break
        case 'settings/SET_CHART_THEME':
          this._chartController.chartInstance.applyOptions(getCustomColorsOptions())
          break
        case 'settings/TOGGLE_NORMAMIZE_WATERMARKS':
          this._chartController.refreshMarkets()
          break
        case 'settings/SET_TIMEZONE_OFFSET':
          this._chartController.setTimezoneOffset(this.$store.state.settings.timezoneOffset)
          this._chartController.clearChart()
          this._chartController.renderAll()
          break
        case 'panes/SET_PANE_MARKETS':
          if (mutation.payload.id === this.paneId) {
            this._chartController.refreshMarkets()

            this.clear()
            this.fetch()
          }
          break
        case 'panes/SET_PANE_ZOOM':
          if (mutation.payload.id === this.paneId) {
            this._chartController.updateFontSize()
          }

          this.updateChartAxis()
          break
        case this.paneId + '/SET_TIMEFRAME':
          this.setTimeframe(mutation.payload)
          break
        case 'app/EXCHANGE_UPDATED':
        case this.paneId + '/TOGGLE_MARKET':
          this._chartController.refreshMarkets()
          this._chartController.renderAll()
          break
        case this.paneId + '/SET_REFRESH_RATE':
          this._chartController.clearQueue()
          this._chartController.setupQueue()
          break
        case this.paneId + '/TOGGLE_LEGEND':
          if (this.showLegend) {
            this.bindLegend()
          } else {
            this.unbindLegend()
          }
          break
        case this.paneId + '/SET_GRIDLINES':
          this.updateGridlines(mutation.payload.type)
          break
        case this.paneId + '/SET_WATERMARK':
        case this.paneId + '/TOGGLE_NORMAMIZE_WATERMARKS':
          this._chartController.updateWatermark()
          break
        case this.paneId + '/SET_INDICATOR_OPTION':
          this._chartController.setIndicatorOption(mutation.payload.id, mutation.payload.key, mutation.payload.value)
          break
        case this.paneId + '/SET_PRICE_SCALE':
          if (mutation.payload.priceScale) {
            this._chartController.refreshPriceScale(mutation.payload.id)
          }
          break
        case this.paneId + '/SET_INDICATOR_SCRIPT':
          this._chartController.rebuildIndicator(mutation.payload.id)
          break
        case this.paneId + '/ADD_INDICATOR':
          if (this._chartController.addIndicator(mutation.payload.id)) {
            this._chartController.redrawIndicator(mutation.payload.id)
            this.bindLegend(mutation.payload.id)
          }

          break
        case this.paneId + '/REMOVE_INDICATOR':
          this.unbindLegend(mutation.payload)
          this._chartController.removeIndicator(mutation.payload)
          break
        case this.paneId + '/TOGGLE_FILL_GAPS_WITH_EMPTY':
          this._chartController.toggleFillGapsWithEmpty()
          break
        case this.paneId + '/TOGGLE_FORCE_NORMALIZE_PRICE':
          this._chartController.propagateInitialPrices = (this.$store.state[this.paneId] as ChartPaneState).forceNormalizePrice
          this.clear()
          this.fetch()
          break
        case 'settings/TOGGLE_AUTO_HIDE_HEADERS':
          this.refreshChartDimensions()
          break
        case 'app/SET_OPTIMAL_DECIMAL':
        case 'settings/SET_DECIMAL_PRECISION':
          for (const id in this.indicators) {
            const indicator = (this.$store.state[this.paneId] as ChartPaneState).indicators[id]

            if (!indicator.options) {
              continue
            }

            if (indicator.options.priceFormat && indicator.options.priceFormat.type === 'price') {
              this._chartController.setIndicatorOption(indicator.id, 'priceFormat.precision', mutation.payload)

              this._chartController.setIndicatorOption(indicator.id, 'priceFormat.minMove', 1 / Math.pow(10, mutation.payload))
            }
          }

          break
      }
    })
  }

  mounted() {
    this.showIndicatorsOverlay = this.$parent.$el.clientHeight > 420

    this.createChart()

    this.keepAlive()
  }

  async createChart() {
    await this.$nextTick()

    this._chartController.createChart(this.$refs.chartContainer)

    await this.$nextTick()

    this.bindChartEvents()

    await this.fetch()

    this.updateChartAxis()

    this._chartController.setupQueue()
  }

  destroyChart() {
    this.unbindChartEvents()

    this._chartController.destroy()

    clearTimeout(this._keepAliveTimeout)
  }

  beforeDestroy() {
    this.destroyChart()
    this._onStoreMutation()
  }

  /**
   * fetch whatever is missing based on visiblerange
   * @param {TimeRange} range range to fetch
   */
  fetch(range?: TimeRange) {
    if (this.loading) {
      return
    }

    const alreadyHasData = this._chartController.chartCache.cacheRange && this._chartController.chartCache.cacheRange.from

    const historicalMarkets = historicalService.getHistoricalMarktets(this.$store.state.panes.panes[this.paneId].markets)

    if (!historicalMarkets.length) {
      return
    }

    if (this.$store.state.app.apiSupportedTimeframes.indexOf(this.timeframe.toString()) === -1) {
      return
    }

    const visibleRange = this._chartController.getVisibleRange() as TimeRange
    const timeframe = +(this.$store.state[this.paneId] as ChartPaneState).timeframe

    if (isNaN(timeframe)) {
      this._reachedEnd = true
      return
    }

    let rangeToFetch

    if (!range) {
      let rightTime

      if (alreadyHasData) {
        rightTime = this._chartController.chartCache.cacheRange.from
      } else if (visibleRange && visibleRange.from) {
        rightTime = visibleRange.from + this.$store.state.settings.timezoneOffset / 1000
      } else {
        rightTime = Date.now() / 1000
      }

      rangeToFetch = {
        from: rightTime - timeframe * 10,
        to: rightTime
      }
    } else {
      rangeToFetch = range
    }

    rangeToFetch.from = floorTimestampToTimeframe(Math.round(rangeToFetch.from), timeframe)
    rangeToFetch.to = floorTimestampToTimeframe(Math.round(rangeToFetch.to), timeframe) + timeframe

    const barsCount = (rangeToFetch.to - rangeToFetch.from) / timeframe
    const bytesPerBar = 112
    const estimatedSize = formatBytes(barsCount * historicalMarkets.length * bytesPerBar)

    this.$store.dispatch('app/showNotice', {
      id: 'fetching-' + this.paneId,
      timeout: 15000,
      title: `Fetching ${barsCount * historicalMarkets.length} bars (~${estimatedSize})`,
      type: 'info'
    })

    this.loading = true

    return historicalService
      .fetch(rangeToFetch.from * 1000, rangeToFetch.to * 1000, timeframe, historicalMarkets)
      .then(results => this.onHistorical(results))
      .catch(() => {
        this._reachedEnd = true
      })
      .then(() => {
        this.$store.dispatch('app/hideNotice', 'fetching-' + this.paneId)

        setTimeout(() => {
          this.loading = false

          this.fetchMore(this._chartController.chartInstance.timeScale().getVisibleLogicalRange())
        }, 200)
      })
  }

  /**
   * TV chart mousemove event
   * @param{TV.MouseEventParams} param tv mousemove param
   */
  onCrosshair(param) {
    let x

    if (param && param.time && param.point.x > 0 && param.point.x < this.$refs.chartContainer.clientWidth) {
      x = param.point.x
    }

    if (this._lastCoordinates === x) {
      return
    }

    this._lastCoordinates = x

    for (let i = 0; i < this._chartController.loadedIndicators.length; i++) {
      const indicator = this._chartController.loadedIndicators[i]

      if (!indicator.apis.length) {
        continue
      }

      const id = this.paneId + indicator.id

      if (!this._legendElements[id]) {
        continue
      }

      if (!x) {
        this._legendElements[id].textContent = ''
        continue
      }

      let text = ''

      for (let j = 0; j < indicator.apis.length; j++) {
        const api = indicator.apis[j]

        const data = param.seriesPrices.get(api)

        if (text.length) {
          text += '\u00a0|\u00a0'
        }

        if (!data) {
          text += 'na'
          continue
        }

        const formatFunction = indicator.options.priceFormat && indicator.options.priceFormat.type === 'volume' ? formatAmount : formatPrice

        if (typeof data === 'number') {
          text += formatFunction(data, 0)
        } else if (data.close) {
          text += `O: ${formatFunction(data.open)} H: ${formatFunction(data.high)} L: ${formatFunction(data.low)} C: ${formatFunction(data.close)}`
        }
      }

      this._legendElements[id].textContent = text
    }
  }

  /**
   * Handle the historical service response
   * Split bars into chunks and add to chartCache
   * Render chart once everything is done
   */
  onHistorical(results: HistoricalResponse) {
    {
      /**
       * @type {Chunk}
       */
      let chunk

      switch (results.format) {
        case 'point':
          chunk = {
            from: results.from,
            to: results.to,
            bars: results.data
          }
          break
        default:
          throw new Error('unsupported-historical-data-format')
      }

      if (chunk && chunk.bars.length) {
        /**
         * @type {Chunk[]}
         */
        const chunks = [
          {
            from: chunk.from,
            to: chunk.from,
            bars: []
          }
        ]

        console.log(`[chart/fetch] success (${results.data.length} new ${results.format}s)`)

        while (chunk.bars.length) {
          const bar = chunk.bars.shift()

          if (chunks[0].bars.length >= MAX_BARS_PER_CHUNKS && chunks[0].to < bar.timestamp) {
            chunks.unshift({
              from: bar.timestamp,
              to: bar.timestamp,
              bars: []
            })
          }

          chunks[0].bars.push(bar)
          chunks[0].to = bar.timestamp
        }

        console.debug(`[chart/fetch] save ${chunks.length} new chunks`)

        for (const chunk of chunks) {
          this._chartController.chartCache.saveChunk(chunk)
        }

        if (!(this.$store.state[this.paneId] as ChartPaneState).forceNormalizePrice) {
          this._chartController.propagateInitialPrices = false
        }

        this._chartController.renderAll()
      }
    }
  }

  /**
   * @param{Trade[]} trades trades to process
   */
  onTrades(trades) {
    this._chartController.queueTrades(trades)
  }

  refreshChartDimensions() {
    if (!this._chartController || !this._chartController.chartInstance) {
      return
    }

    this.$nextTick(() => {
      let headerHeight = 0

      if (!this.$store.state.settings.autoHideHeaders) {
        headerHeight = (this.$store.state.panes.panes[this.paneId].zoom || 1) * 2 * 16
      }

      this._chartController.chartInstance.resize(this.$el.clientWidth, this.$el.clientHeight - headerHeight)
    })
  }

  onPan(visibleLogicalRange) {
    if (!visibleLogicalRange || this._chartController.panPrevented || /t$/.test(this.timeframe)) {
      return
    }

    if (this._onPanTimeout) {
      clearTimeout(this._onPanTimeout)
      this._onPanTimeout = null
    }

    this._onPanTimeout = setTimeout(() => {
      if (this._chartController.chartCache.cacheRange.from === null) {
        return
      }

      this.savePosition(visibleLogicalRange)

      this.fetchMore(visibleLogicalRange)
    }, 1000)
  }

  bindChartEvents() {
    aggregatorService.on('trades', this.onTrades)

    if (this.showLegend && this.showIndicatorsOverlay) {
      this.bindLegend()
    }

    this._chartController.chartInstance.timeScale().subscribeVisibleLogicalRangeChange(this.onPan)
  }

  unbindChartEvents() {
    aggregatorService.off('trades', this.onTrades)

    this.unbindLegend()

    this._chartController.chartInstance.timeScale().unsubscribeVisibleLogicalRangeChange(this.onPan)
  }

  savePosition(visibleLogicalRange) {
    const canvasWidth = this.$refs.chartContainer.querySelector('canvas').width
    const barSpacing = canvasWidth / (visibleLogicalRange.to - visibleLogicalRange.from) / window.devicePixelRatio

    this.$store.commit(this.paneId + '/SET_BAR_SPACING', barSpacing)
  }

  keepAlive() {
    if (this._keepAliveTimeout) {
      this.trimChart()
      this.renderChart()
    }

    this._keepAliveTimeout = setTimeout(this.keepAlive.bind(this), 1000 * 60 * 5)
  }

  refreshChart() {
    this.trimChart()
    this.renderChart()
  }

  trimChart() {
    const visibleRange = this._chartController.getVisibleRange() as TimeRange

    let end

    if (visibleRange) {
      end = visibleRange.from - (visibleRange.to - visibleRange.from)
    }

    this._chartController.chartCache.trim(end)
  }

  renderChart() {
    this._chartController.renderAll()
  }

  resetChart() {
    this.destroyChart()
    this.$nextTick(() => {
      this.createChart()
    })
  }

  addIndicator() {
    dialogService.open(CreateIndicatorDialog, { paneId: this.paneId })
  }

  async fetchMore(visibleLogicalRange) {
    if (this.loading || this._reachedEnd || !visibleLogicalRange || visibleLogicalRange.from > 0) {
      return
    }

    let indicatorLength = 0

    if (this._chartController.activeRenderer) {
      for (const indicatorId in this._chartController.activeRenderer.indicators) {
        if (!this._chartController.activeRenderer.indicators[indicatorId].minLength) {
          continue
        }
        indicatorLength = Math.max(indicatorLength, this._chartController.activeRenderer.indicators[indicatorId].minLength)
      }
    }

    const barsToLoad = Math.round(Math.min(Math.abs(visibleLogicalRange.from) + indicatorLength, 500))

    if (!barsToLoad) {
      return
    }

    const rangeToFetch = {
      from: this._chartController.chartCache.cacheRange.from - barsToLoad * this.$store.state[this.paneId].timeframe,
      to: this._chartController.chartCache.cacheRange.from - 1
    }

    if (!this._chartController.chartCache.cacheRange.from || rangeToFetch.to <= this._chartController.chartCache.cacheRange.from) {
      await this.fetch(rangeToFetch)
    }
  }

  onResize() {
    this.refreshChartDimensions()
  }

  clear() {
    this._chartController.clear()

    this._reachedEnd = false
  }

  changeTimeframe(newTimeframe) {
    if ((window.event as any).shiftKey) {
      for (const id in this.$store.state.panes.panes) {
        const type = this.$store.state.panes.panes[id].type
        if (type === 'chart' && this.$store.state[id].timeframe !== newTimeframe) {
          this.$store.commit(id + '/SET_TIMEFRAME', newTimeframe)
        }
      }
    } else {
      this.$store.commit(this.paneId + '/SET_TIMEFRAME', newTimeframe)
    }
  }

  setTimeframe(newTimeframe) {
    const timeframe = parseInt(newTimeframe)
    const type = newTimeframe[newTimeframe.length - 1] === 't' ? 'tick' : 'time'

    if (
      type === this._chartController.type &&
      type === 'time' &&
      this._chartController.timeframe < timeframe &&
      this.$store.state.app.apiSupportedTimeframes.indexOf(newTimeframe) === -1 &&
      Number.isInteger(timeframe / this._chartController.timeframe)
    ) {
      this._chartController.resample(newTimeframe)
      this.fetchMore(this._chartController.chartInstance.timeScale().getVisibleLogicalRange())
    } else {
      this._chartController.clear()
      this.fetch()
    }

    this._reachedEnd = false
  }

  async bindLegend(indicatorId?: string) {
    if (!this.showLegend) {
      return
    }

    if (!indicatorId) {
      for (const id in this.indicators) {
        this.bindLegend(id)
      }

      this._chartController.chartInstance.subscribeCrosshairMove(this.onCrosshair)
      return
    }

    await this.$nextTick()

    const legendId = this.paneId + indicatorId

    if (this._legendElements[legendId]) {
      return
    }

    const el = document.getElementById(legendId)

    if (el) {
      this._legendElements[legendId] = el
    }
  }

  unbindLegend(indicatorId?: string) {
    if (!indicatorId) {
      for (const id in this.indicators) {
        this.unbindLegend(id)
      }

      this._chartController.chartInstance.unsubscribeCrosshairMove(this.onCrosshair)
      return
    }

    const legendId = this.paneId + indicatorId

    for (const bindedLegendId in this._legendElements) {
      if (legendId === bindedLegendId) {
        delete this._legendElements[bindedLegendId]
        return
      }
    }
  }

  updateGridlines(type: 'vertical' | 'horizontal') {
    const chartOptions = this.$store.state[this.paneId] as ChartPaneState
    let show: boolean
    let color: string

    if (type === 'vertical') {
      show = chartOptions.showVerticalGridlines
      color = chartOptions.verticalGridlinesColor
    } else {
      show = chartOptions.showHorizontalGridlines
      color = chartOptions.horizontalGridlinesColor
    }

    this._chartController.chartInstance.applyOptions({
      grid: {
        [type === 'vertical' ? 'vertLines' : 'horzLines']: {
          color: color,
          visible: show
        }
      }
    })
  }

  updateWatermark() {
    const chartOptions = this.$store.state[this.paneId] as ChartPaneState

    this._chartController.chartInstance.applyOptions({
      watermark: {
        color: chartOptions.watermarkColor,
        visible: chartOptions.showWatermark
      }
    })
  }

  updateChartAxis() {
    setTimeout(() => {
      if (!this.$refs.chartContainer) {
        return
      }

      this.axis = [
        this.$refs.chartContainer.querySelector('td:last-child canvas:nth-child(2)').clientWidth,
        this.$refs.chartContainer.querySelector('tr:last-child').clientHeight
      ]
    }, 1000)
  }

  takeScreenshot() {
    const chartCanvas = this._chartController.chartInstance.takeScreenshot()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    let timeframe = this.$store.state[this.paneId].timeframe as any

    if (!isNaN(+timeframe)) {
      timeframe = getHms(timeframe * 1000).toUpperCase()
    } else {
      timeframe = parseInt(timeframe) + ' TICKS'
    }

    const text = timeframe

    const zoom = this.$store.state.panes.panes[this.paneId].zoom || 1

    const textPadding = 16 * zoom
    const textFontsize = 16 * zoom
    canvas.width = chartCanvas.width
    ctx.font = `${textFontsize}px Share Tech Mono`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const words = text.split(' ')
    const lines = []
    const date = new Date().toISOString()
    const dateWidth = ctx.measureText(date).width

    let currentLine = ' |'

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const width = (!lines.length ? dateWidth : 0) + ctx.measureText(currentLine + ' ' + word).width
      if (width < chartCanvas.width - textPadding * 2) {
        currentLine += ' ' + word
      } else {
        lines.push(currentLine)
        currentLine = word
      }
    }

    lines.push(currentLine)

    const lineHeight = Math.round(textPadding)
    const headerHeight = Math.round(textPadding * 2 + lines.length * lineHeight)
    canvas.height = chartCanvas.height

    const backgroundColor = this.$store.state.settings.backgroundColor
    const backgroundColor300 = getComputedStyle(document.documentElement).getPropertyValue('--theme-background-300')
    const color100 = getComputedStyle(document.documentElement).getPropertyValue('--theme-color-100')

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = this.$store.state.settings.theme === 'light' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(chartCanvas, 0, 0)

    ctx.fillStyle = backgroundColor300
    ctx.font = `${textFontsize}px Share Tech Mono`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    for (let i = 0; i < lines.length; i++) {
      let offset = 0

      if (i === 0) {
        ctx.fillStyle = color100
        ctx.fillText(date, textPadding, textPadding)
        offset = dateWidth
        ctx.fillStyle = color100
      }

      ctx.fillText(lines[i], offset + textPadding, textPadding + lineHeight * i)
    }

    const luminance = getColorLuminance(splitRgba(backgroundColor))
    const textColor = luminance < 170 ? '#ffffff' : '#000000'

    Object.values(this.indicators).forEach((indicator, index) => {
      const options = indicator.options as any

      if (options.visible === false) {
        return
      }

      let color = options.color || options.upColor || textColor

      try {
        color = splitRgba(color)

        if (typeof color[3] !== 'undefined') {
          color[3] = 1
        }

        color = joinRgba(color)
      } catch (error) {
        // not rgb(a)
      }

      ctx.fillStyle = color
      ctx.fillText(indicator.displayName || indicator.name, textPadding, headerHeight + textPadding + index * lineHeight * 1.2)
    })

    const dataURL = canvas.toDataURL('image/png')
    const startIndex = dataURL.indexOf('base64,') + 7
    const b64 = dataURL.substr(startIndex)

    openBase64InNewTab(b64, 'image/png')
  }

  toggleMarket(event, id) {
    this.$store.dispatch(this.paneId + '/toggleMarkets', { id, inverse: event.shiftKey })
  }

  toggleMarkets(type) {
    this.$store.dispatch(this.paneId + '/toggleMarkets', { type })
  }

  toggleIndicatorOverlay() {
    if (this.showIndicatorsOverlay) {
      this.unbindLegend()
    }

    this.showIndicatorsOverlay = !this.showIndicatorsOverlay

    if (this.showIndicatorsOverlay) {
      this.$nextTick(() => {
        this.bindLegend()
      })
    }
  }

  toggleFavoriteTimeframe(timeframe) {
    this.$store.commit('settings/TOGGLE_FAVORITE_TIMEFRAME', timeframe)
  }

  toggleLayout() {
    this.$store.commit(this.paneId + '/TOGGLE_LAYOUTING')
  }
}
</script>

<style lang="scss" scoped>
.pane-chart {
  font-family: 'Barlow Semi Condensed';

  &:hover .chart-overlay {
    display: flex;
  }

  &.-loading {
    cursor: wait;
  }
}

.chart__container {
  position: relative;
  width: 100%;
  flex-grow: 1;

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.chart__markets {
  flex-grow: 1;
  overflow: hidden;

  .chart-overlay__content {
    overflow: auto;
  }

  .checkbox-control {
    span {
      text-decoration: line-through;
      opacity: 0.5;
    }
    input:checked ~ span {
      text-decoration: none;
      opacity: 1;
    }
  }

  li {
    cursor: pointer;
    &.-hidden {
      opacity: 0.5;
      text-decoration: line-through;
    }
  }
}

.chart__layout {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
}

.chart-overlay {
  display: none;
  position: absolute;
  z-index: 3;
  top: 3em;
  pointer-events: none;

  &.-left {
    left: 1em;
    bottom: 0;
    flex-direction: column;
    justify-content: flex-start;

    > div {
      flex-shrink: 0;
      flex-basis: 0;
    }
  }

  &.-right {
    right: 1em;
    pointer-events: all;
  }

  &__panel {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;

    > div {
      pointer-events: all;
    }
  }

  &__content {
    padding: 0;
    margin: 0;
  }

  &__title {
    cursor: pointer;
    user-select: none;
    color: var(--theme-color-150);
    place-self: flex-start;
    padding: 0.2em 0.25em 0.3em;

    &:hover {
      color: var(--theme-color-base);
    }

    .icon-up {
      vertical-align: middle;
    }

    &:first-child {
      .icon-up {
        display: inline-block;
        transform: rotateZ(180deg);
      }
    }
  }
}

body.-unselectable .chart-overlay {
  display: none !important;
}
</style>

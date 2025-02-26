<template>
  <div class="pane-prices" :class="{ [mode]: true, '-bold': this.boldFont }" @mouseenter="pauseSort = true" @mouseleave="pauseSort = false">
    <pane-header :paneId="paneId" />
    <transition-group v-if="markets" :name="transitionGroupName" tag="div" class="markets-bar condensed hide-scrollbar pane">
      <div
        v-for="market in markets"
        :key="market.id"
        class="market"
        :class="{ ['-' + market.exchange]: true, ['-' + market.status]: true }"
        :title="market.id"
      >
        <div v-if="showPairs" class="market__pair" v-text="market.pair"></div>
        <div class="market__price" v-text="formatPrice(market.price)"></div>
      </div>
    </transition-group>
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'

import { formatPrice, parseMarket } from '../../utils/helpers'

import aggregatorService from '@/services/aggregatorService'
import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '../panes/PaneHeader.vue'
import { Market } from '@/types/test'

type MarketsBarMarketStatus = 'pending' | 'idle' | 'up' | 'down' | 'neutral'

@Component({
  components: { PaneHeader },
  name: 'Prices'
})
export default class extends Mixins(PaneMixin) {
  mode = '-vertical'
  pauseSort = false
  markets: (Market & { price: number; status: MarketsBarMarketStatus })[] = null

  @Watch('pane.markets')
  private marketChange(currentMarket, previousMarkets) {
    for (const id of previousMarkets) {
      if (currentMarket.indexOf(id) === -1) {
        this.removeMarketFromList(id)
      }
    }

    for (const id of currentMarket) {
      if (previousMarkets.indexOf(id) === -1) {
        const [exchange, pair] = parseMarket(id)

        this.addMarketToList({
          id: exchange + pair,
          exchange,
          pair
        })
      }
    }
  }

  get activeMarkets() {
    return this.$store.state.app.activeMarkets
  }

  get exchanges() {
    return this.$store.state.exchanges
  }

  get disableAnimations() {
    return this.$store.state.settings.disableAnimations
  }

  get showPairs() {
    return this.$store.state[this.paneId].showPairs
  }

  get boldFont() {
    return this.$store.state[this.paneId].boldFont
  }

  get animateSort() {
    return this.$store.state[this.paneId].animateSort
  }

  get transitionGroupName() {
    if (this.animateSort) {
      return 'flip-list'
    } else {
      return null
    }
  }

  mounted() {
    aggregatorService.on('prices', this.updateExchangesPrices)
  }

  beforeDestroy() {
    aggregatorService.off('prices', this.updateExchangesPrices)
  }

  updateExchangesPrices(marketsPrices) {
    if (!this.markets) {
      this.markets = []

      for (const market of this.pane.markets) {
        const [exchange, pair] = parseMarket(market)

        this.addMarketToList({
          id: exchange + pair,
          pair,
          exchange
        })
      }
    } else {
      for (const market of this.markets) {
        const price = marketsPrices[market.id]

        if (price === market.price) {
          continue
        }

        if (!price) {
          market.status = 'pending'
        } else if (market.price > price) {
          market.status = 'down'
        } else if (market.price < price) {
          market.status = 'up'
        } else {
          market.status = 'neutral'
        }

        market.price = price
      }
    }

    if (!this.pauseSort) {
      if (this.mode === '-horizontal') {
        this.markets = this.markets.sort((a, b) => a.price - b.price)
      } else {
        this.markets = this.markets.sort((a, b) => b.price - a.price)
      }
    }
  }

  removeMarketFromList(market: string) {
    const index = this.markets.indexOf(this.markets.find(m => m.exchange + ':' + m.pair === market))

    if (index !== -1) {
      this.markets.splice(index, 1)
    } else {
      console.warn(`[prices] unable to remove market from list after panes.markets change: market doesn't exists in list (${market})`)
    }
  }

  addMarketToList(market: Market) {
    if (!this.markets) {
      this.markets = []
    }

    this.markets.push({
      ...market,
      status: 'pending',
      price: null
    })
  }

  formatPrice(amount) {
    return formatPrice(amount)
  }

  onResize(width: number, height: number) {
    this.mode = width > height ? '-horizontal' : '-vertical'
  }
}
</script>

<style lang="scss" scoped>
.markets-bar {
  display: flex;
  flex-direction: row;
  height: 30px;
  overflow-x: auto;
  height: 100%;

  @each $exchange, $icon in $exchanges {
    .market.-#{$exchange} {
      background-image: url('../../assets/exchanges/#{$exchange}.svg');
    }
  }

  .market {
    padding: 0.5em 0.5em 0.5em 2em;
    display: flex;
    flex-direction: row;
    font-size: 0.9em;
    align-items: center;
    flex-grow: 1;
    flex-basis: 0;
    position: relative;
    line-height: 1;
    background-position: 0.5em;
    background-repeat: no-repeat;
    background-size: 1em;
    cursor: pointer;

    &__pair {
      white-space: nowrap;
    }

    &__price {
      margin-left: 0.5rem;
    }

    &.-up {
      background-color: transparent;
      color: lighten($green, 10%);
    }
    &.-down {
      background-color: transparent;
      color: $red;
    }
    &.-neutral {
      color: rgba(white, 0.75);
      font-style: italic;
    }
    &.-pending {
      background-color: rgba(white, 0.2);
      opacity: 0.5;
    }
    &.-hidden {
      text-decoration: line-through;
    }
  }
}

.pane-prices {
  &.-vertical .markets-bar {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    width: 100%;
    height: 100%;

    .market__price {
      margin-left: auto;
    }
  }

  &.-bold .market {
    font-weight: 600;
  }
}
</style>

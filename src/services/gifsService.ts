import store from '@/store'
import { slugify } from '@/utils/helpers'
import workspacesService from './workspacesService'

class GifsService {
  cache: { [keyword: string]: string[] } = {}
  promisesOfGifs: { [keyword: string]: Promise<string[]> } = {}

  constructor() {
    setTimeout(this.cleanExpiredGifs, 60000 + Math.random() * 60000)
  }

  async cleanExpiredGifs() {
    const keywords = await workspacesService.getGifsKeywords()

    console.log(keywords)
  }

  async forgetGifs(keyword) {
    if (this.cache[keyword]) {
      store.dispatch('app/showNotice', {
        title: 'Forgeting ' + this.cache[keyword].length + ' gifs about "' + keyword + '"',
        type: 'info'
      })

      delete this.cache[keyword]
    }
  }

  async deleteGifs(keyword) {
    const slug = slugify(keyword)
    await workspacesService.deleteGifs(slug)

    store.dispatch('app/showNotice', {
      title: 'Removed gifs about "' + keyword + '"',
      type: 'info'
    })
  }

  async getGifs(keyword) {
    if (this.cache[keyword]) {
      return this.cache[keyword]
    }

    const slug = slugify(keyword)

    const storage = await workspacesService.getGifs(slug)

    if (storage && Date.now() - storage.timestamp < 1000 * 60 * 60 * 24 * 7) {
      return storage.data
    } else if (!this.promisesOfGifs[keyword]) {
      return await this.fetchGifByKeyword(keyword)
    }
  }

  async fetchGifByKeyword(keyword: string) {
    if (!keyword) {
      return
    }

    const slug = slugify(keyword)

    const promise = fetch('https://api.giphy.com/v1/gifs/search?q=' + keyword + '&rating=r&limit=100&api_key=b5Y5CZcpj9spa0xEfskQxGGnhChYt3hi')
      .then(res => res.json())
      .then(async res => {
        if (!res.data || !res.data.length) {
          return
        }

        this.cache[keyword] = []

        for (const item of res.data) {
          this.cache[keyword].push(item.images.downsized.url)
        }

        store.dispatch('app/showNotice', {
          title: 'found ' + this.cache[keyword].length + ' ' + keyword + ' gifs',
          type: 'success'
        })

        await workspacesService.saveGifs({
          slug,
          keyword: keyword,
          timestamp: Date.now(),
          data: this.cache[keyword]
        })

        return this.cache[keyword]
      })
      .finally(() => {
        delete this.promisesOfGifs[keyword]
      })

    this.promisesOfGifs[keyword] = promise

    return promise
  }
}

export default new GifsService()

<template>
  <dropdown :options="presets" @output="onSelect" :placeholder="label" class="mrauto" selectionClass="ml0 -green -arrow">
    <template v-slot:option-custom>
      <div class="column" @mousedown.prevent>
        <div class="btn -green" @click="savePreset"><i class="icon-plus"></i></div>
        <div class="btn -blue" @click="uploadPreset"><i class="icon-upload"></i></div>
        <div class="btn -red" @click="applyDefault"><i class="icon-eraser"></i><span class="ml8">Reset</span></div>
      </div>
    </template>
    <template v-slot:option="{ value }">
      <i v-if="value.icon" :class="'-lower icon-' + value.icon"></i>

      <span class="mr4">{{ value.label }}</span>

      <button type="button" class="dropdown-option__action btn -small mlauto" @mousedown.prevent @click="openPreset(value.id, value.label)">
        <i class="icon-edit"></i>
      </button>
    </template>
  </dropdown>
</template>

<script lang="ts">
import dialogService from '@/services/dialogService'
import workspacesService from '@/services/workspacesService'
import { Preset, PresetType } from '@/types/test'
import { Component, Vue } from 'vue-property-decorator'
import Dropdown from '@/components/framework/Dropdown.vue'
import PresetDialog from '../settings/PresetDialog.vue'
import { browseFile } from '@/utils/helpers'

@Component({
  components: { Dropdown },
  props: {
    type: {
      required: true
    },
    adapter: {
      required: true
    },
    label: {
      default: 'Presets'
    }
  }
})
export default class extends Vue {
  type: PresetType
  adapter: Function

  presets = [
    {
      id: 'custom'
    }
  ] as any

  created() {
    this.getPresets()
  }

  async getPresets() {
    this.presets.splice(1, this.presets.length)

    const keys = (await workspacesService.getPresetsKeysByType(this.type)) as string[]

    for (let i = 0; i < keys.length; i++) {
      this.presets.push({
        id: keys[i],
        label: keys[i]
          .split(':')
          .slice(1)
          .join(':')
      })
    }
  }

  async onSelect(index) {
    if (typeof this.presets[index].click === 'function') {
      return
    }

    const preset = await workspacesService.getPreset(this.presets[index].id)

    this.applyPreset(preset)
  }

  async openPreset(id: string, name: string) {
    const preset = await workspacesService.getPreset(id)

    if (await dialogService.openAsPromise(PresetDialog, { preset })) {
      this.savePreset(name)
    }

    this.getPresets()
  }

  async savePreset(name?: string) {
    if (!name || typeof name !== 'string') {
      name = await dialogService.prompt('Enter a name')
    } else if (!(await dialogService.confirm(`Override preset ${name} with current settings ?`))) {
      return
    }

    if (!name) {
      return
    }

    const data = await this.adapter()

    if (!data) {
      this.$store.dispatch('app/showNotice', {
        type: 'error',
        title: `Preset should contain data. Not saving this preset.`
      })

      return
    }

    if (data._id) {
      delete data._id
    }

    name = this.type + ':' + name

    const updatedAt = Date.now()

    const original = this.presets.find(preset => preset.name === name)

    let createdAt

    if (original) {
      createdAt = original.createdAt
    } else {
      createdAt = updatedAt
    }

    await workspacesService.savePreset({
      name,
      type: this.type,
      data,
      createdAt,
      updatedAt
    })

    await this.getPresets()
  }

  async applyDefault() {
    if (await dialogService.confirm('Reset ' + this.type + ' to default settings ?')) {
      this.$emit('apply')
    }
  }

  async applyPreset(preset: Preset) {
    this.$emit('apply', preset.data)
  }

  async uploadPreset() {
    let content

    try {
      content = await browseFile()
    } catch (error) {
      this.$store.dispatch('app/showNotice', {
        title: error.message,
        type: 'error'
      })
      return
    }

    let preset

    try {
      if (typeof content === 'string') {
        preset = JSON.parse(content)
      } else {
        throw new Error('invalid file, must be text/json')
      }

      if (!preset.data) {
        throw new Error('preset is empty')
      }

      if (preset.type !== this.type) {
        throw new Error('preset is not ' + this.type + ' type')
      }
    } catch (error) {
      this.$store.dispatch('app/showNotice', {
        title: `Couldn't import preset : ${error.message}`,
        type: 'error'
      })
      return
    }

    await workspacesService.savePreset(preset)

    this.$store.dispatch('app/showNotice', {
      title: `Preset ${preset.name} imported successfully`,
      type: 'info'
    })

    await this.getPresets()
  }
}
</script>

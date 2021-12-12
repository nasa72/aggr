import { Preset, Workspace } from '@/types/test'
import dialogService from './dialogService'
import workspacesService from './workspacesService'
import SettingsImportConfirmation from '../components/settings/ImportConfirmation.vue'
import store from '@/store'

class ImportService {
  getJSON(file: File) {
    return new Promise<any>(resolve => {
      const reader = new FileReader()

      reader.onload = async event => {
        try {
          resolve(JSON.parse(event.target.result as string))
        } catch (error) {
          throw new Error('Unable to read file')
        }
      }

      reader.readAsText(file)
    })
  }

  async importSound(file: File) {
    if (file.type.indexOf('audio') !== 0) {
      throw new Error('File must be audio file')
    }

    let uploadedSound = await workspacesService.getSound(file.name)

    if (uploadedSound) {
      return
    }

    uploadedSound = {
      name: file.name,
      data: new Blob([file], { type: file.type })
    }

    await workspacesService.saveSound(uploadedSound)

    store.dispatch('app/showNotice', {
      title: `Successfully imported sound ${file.name}`,
      type: 'info'
    })

    return uploadedSound
  }

  async importPreset(file: File, presetType?: string) {
    const preset: Preset = await this.getJSON(file)

    if (!preset.data) {
      throw new Error('Preset is empty')
    }

    if (preset.type !== presetType) {
      throw new Error('Preset is not ' + presetType + ' type')
    }

    await workspacesService.savePreset(preset)

    store.dispatch('app/showNotice', {
      title: `Successfully imported preset ${preset.name}`,
      type: 'info'
    })

    return preset
  }

  async importWorkspace(file: File) {
    const workspace: Workspace = await new Promise(resolve => {
      const reader = new FileReader()

      reader.onload = async event => {
        try {
          resolve(JSON.parse(event.target.result as string))
        } catch (error) {
          throw new Error('Unable to read file')
        }
      }

      reader.readAsText(file)
    })

    if (!workspace.id || !workspace.name || !workspace.states) {
      throw new Error('Unrecognized workspace file')
    }

    if (Object.keys(workspace.states).length === 0) {
      throw new Error('Workspace seems empty')
    }

    for (const paneId in workspace.states) {
      const pane = workspace.states[paneId]

      if (pane.type === 'website') {
        pane.locked = true
      }
    }

    if (
      (await workspacesService.getWorkspace(workspace.id)) &&
      !(await dialogService.confirm({
        message: `Workspace ${workspace.id} already exists`,
        ok: 'Import anyway',
        cancel: 'Annuler'
      }))
    ) {
      return
    }

    if (
      await dialogService.openAsPromise(SettingsImportConfirmation, {
        workspace
      })
    ) {
      await workspacesService.addAndSetWorkspace(workspace)

      store.dispatch('app/showNotice', {
        title: `Successfully imported workspace ${workspace.name}`,
        type: 'info'
      })

      return workspace
    }

    return null
  }
}

export default new ImportService()

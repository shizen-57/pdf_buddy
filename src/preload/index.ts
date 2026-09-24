import { contextBridge, ipcRenderer } from 'electron'
import type { BuddyApi } from '@shared/types'

let seq = 0

const api: BuddyApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s),
    listModels: () => ipcRenderer.invoke('settings:models')
  },
  llm: {
    complete: (messages, opts) => ipcRenderer.invoke('llm:complete', messages, opts),
    async stream(messages, onDelta) {
      const id = `s${++seq}`
      const listener = (_e: unknown, sid: string, t: string) => sid === id && onDelta(t)
      ipcRenderer.on('llm:delta', listener)
      try {
        return await ipcRenderer.invoke('llm:stream', id, messages)
      } finally {
        ipcRenderer.removeListener('llm:delta', listener)
      }
    }
  },
  embed: (texts) => ipcRenderer.invoke('embed', texts)
}

contextBridge.exposeInMainWorld('buddy', api)

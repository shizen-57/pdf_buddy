import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { ChatMessage } from '@shared/types'
import { getSettings, setSettings } from './settings'
import { complete, listModels, stream } from './llm'
import { embed } from './embed'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'PDF Buddy',
    backgroundColor: '#faf8f5',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('settings:get', () => getSettings())
ipcMain.handle('settings:set', (_e, patch) => setSettings(patch))
ipcMain.handle('settings:models', () => listModels())
ipcMain.handle('llm:complete', (_e, messages: ChatMessage[], opts) => complete(messages, opts))
ipcMain.handle('llm:stream', (e, id: string, messages: ChatMessage[]) =>
  stream(messages, (t) => e.sender.send('llm:delta', id, t))
)
ipcMain.handle('embed', (_e, texts: string[]) => embed(texts))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())

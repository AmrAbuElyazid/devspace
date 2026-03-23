import { ipcMain, dialog, shell, nativeTheme, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import type { PtyManager } from './pty-manager'
import type { PtyCreateOptions } from '../shared/types'

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager
): void {
  // --- PTY handlers ---

  ipcMain.handle('pty:create', (_event, options: PtyCreateOptions) => {
    return ptyManager.create(options)
  })

  ipcMain.on('pty:write', (_event, ptyId: string, data: string) => {
    ptyManager.write(ptyId, data)
  })

  ipcMain.on('pty:resize', (_event, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on('pty:destroy', (_event, ptyId: string) => {
    ptyManager.destroy(ptyId)
  })

  // PTY event forwarding to renderer
  ptyManager.onData((ptyId, data) => {
    mainWindow.webContents.send('pty:data', ptyId, data)
  })

  ptyManager.onExit((ptyId, code) => {
    mainWindow.webContents.send('pty:exit', ptyId, code)
  })

  // --- Window handlers ---

  ipcMain.on('window:minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow.isMaximized()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximizeChange', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximizeChange', false)
  })

  // --- Dialog handlers ---

  ipcMain.handle(
    'dialog:openFile',
    async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const content = readFileSync(filePath, 'utf-8')
      return { path: filePath, content }
    }
  )

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  // --- File system handlers ---

  ipcMain.handle('fs:readFile', (_event, filePath: string) => {
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('fs:writeFile', (_event, filePath: string, content: string) => {
    writeFileSync(filePath, content, 'utf-8')
  })

  // --- Shell handlers ---

  ipcMain.on('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // --- Theme handlers ---

  ipcMain.on('theme:set', (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
  })

  ipcMain.handle('theme:getNativeTheme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    mainWindow.webContents.send(
      'theme:nativeThemeChange',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })
}

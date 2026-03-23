import { ipcMain, dialog, shell, nativeTheme, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import type { PtyManager } from './pty-manager'
import {
  validateTerminalDimensions,
  validatePtyId,
  validatePtyWriteData,
  validateFilePath,
  getSafeExternalUrl
} from './validation'

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager
): void {
  const allowedRoots = [homedir()]

  // --- PTY handlers ---

  ipcMain.handle('pty:create', (_event, options: unknown) => {
    if (typeof options !== 'object' || options === null) {
      return { error: 'Invalid pty create options' }
    }
    const opts = options as Record<string, unknown>
    const dims = validateTerminalDimensions(opts.cols, opts.rows)
    if (!dims) {
      return { error: 'Invalid terminal dimensions (cols: 20-400, rows: 5-200)' }
    }
    return ptyManager.create({
      cols: dims.cols,
      rows: dims.rows,
      cwd: typeof opts.cwd === 'string' ? opts.cwd : undefined,
      shell: typeof opts.shell === 'string' ? opts.shell : undefined
    })
  })

  ipcMain.on('pty:write', (_event, ptyId: unknown, data: unknown) => {
    const validId = validatePtyId(ptyId)
    if (!validId) return
    const validData = validatePtyWriteData(data)
    if (!validData) return
    ptyManager.write(validId, validData)
  })

  ipcMain.on('pty:resize', (_event, ptyId: unknown, cols: unknown, rows: unknown) => {
    const validId = validatePtyId(ptyId)
    if (!validId) return
    const dims = validateTerminalDimensions(cols, rows)
    if (!dims) return
    ptyManager.resize(validId, dims.cols, dims.rows)
  })

  ipcMain.on('pty:destroy', (_event, ptyId: unknown) => {
    const validId = validatePtyId(ptyId)
    if (!validId) return
    ptyManager.destroy(validId)
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
      try {
        const content = readFileSync(filePath, 'utf-8')
        return { path: filePath, content }
      } catch {
        return { error: `Failed to read file: ${filePath}` }
      }
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

  ipcMain.handle('fs:readFile', (_event, filePath: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots)
    if (!validPath) {
      return { error: 'File path is not allowed' }
    }
    try {
      return readFileSync(validPath, 'utf-8')
    } catch {
      return { error: `Failed to read file: ${validPath}` }
    }
  })

  ipcMain.handle('fs:writeFile', (_event, filePath: unknown, content: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots)
    if (!validPath) {
      return { error: 'File path is not allowed' }
    }
    if (typeof content !== 'string') {
      return { error: 'File content must be a string' }
    }
    try {
      writeFileSync(validPath, content, 'utf-8')
    } catch {
      return { error: `Failed to write file: ${validPath}` }
    }
  })

  // --- Shell handlers ---

  ipcMain.on('shell:openExternal', (_event, url: unknown) => {
    const safeUrl = getSafeExternalUrl(url)
    if (!safeUrl) return
    shell.openExternal(safeUrl)
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

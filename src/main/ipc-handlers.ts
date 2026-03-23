import { ipcMain, dialog, shell, nativeTheme, BrowserWindow, Menu } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import type { PtyManager } from './pty-manager'
import {
  validateTerminalDimensions,
  validatePtyId,
  validatePtyWriteData,
  validateFilePath,
  getSafeExternalUrl
} from './validation'

const registeredHandlers = new Set<string>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeHandle(channel: string, handler: (event: any, ...args: any[]) => any) {
  if (registeredHandlers.has(channel)) return
  registeredHandlers.add(channel)
  ipcMain.handle(channel, handler)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeOn(channel: string, handler: (event: any, ...args: any[]) => void) {
  if (registeredHandlers.has(channel)) return
  registeredHandlers.add(channel)
  ipcMain.on(channel, handler)
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager
): void {
  const allowedRoots = [homedir()]

  // --- PTY handlers ---

  safeHandle('pty:create', (_event, options: unknown) => {
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

  safeOn('pty:write', (_event, ptyId: unknown, data: unknown) => {
    const validId = validatePtyId(ptyId)
    if (!validId) return
    const validData = validatePtyWriteData(data)
    if (!validData) return
    ptyManager.write(validId, validData)
  })

  safeOn('pty:resize', (_event, ptyId: unknown, cols: unknown, rows: unknown) => {
    const validId = validatePtyId(ptyId)
    if (!validId) return
    const dims = validateTerminalDimensions(cols, rows)
    if (!dims) return
    ptyManager.resize(validId, dims.cols, dims.rows)
  })

  safeOn('pty:destroy', (_event, ptyId: unknown) => {
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

  safeOn('window:minimize', () => {
    mainWindow.minimize()
  })

  safeOn('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  safeOn('window:close', () => {
    mainWindow.close()
  })

  safeHandle('window:isMaximized', () => {
    return mainWindow.isMaximized()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximizeChange', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximizeChange', false)
  })

  // --- Dialog handlers ---

  safeHandle(
    'dialog:openFile',
    async (_event, defaultPath?: string) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      try {
        const content = await readFile(filePath, 'utf-8')
        return { path: filePath, content }
      } catch {
        return { error: `Failed to read file: ${filePath}` }
      }
    }
  )

  safeHandle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  // --- File system handlers ---

  safeHandle('fs:readFile', async (_event, filePath: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots)
    if (!validPath) {
      return { error: 'File path is not allowed' }
    }
    try {
      return await readFile(validPath, 'utf-8')
    } catch {
      return { error: `Failed to read file: ${validPath}` }
    }
  })

  safeHandle('fs:writeFile', async (_event, filePath: unknown, content: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots)
    if (!validPath) {
      return { error: 'File path is not allowed' }
    }
    if (typeof content !== 'string') {
      return { error: 'File content must be a string' }
    }
    try {
      await writeFile(validPath, content, 'utf-8')
    } catch {
      return { error: `Failed to write file: ${validPath}` }
    }
  })

  // --- Shell handlers ---

  safeOn('shell:openExternal', (_event, url: unknown) => {
    const safeUrl = getSafeExternalUrl(url)
    if (!safeUrl) return
    shell.openExternal(safeUrl)
  })

  // --- Context menu handler ---

  safeHandle('contextMenu:show', async (_event, items: unknown, position: unknown) => {
    if (!Array.isArray(items)) return null

    return new Promise<string | null>((resolve) => {
      let hasDestructive = false
      const template: Electron.MenuItemConstructorOptions[] = []

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        const { id, label, destructive } = item as { id?: string; label?: string; destructive?: boolean }
        if (typeof id !== 'string' || typeof label !== 'string') continue

        if (destructive && !hasDestructive) {
          hasDestructive = true
          template.push({ type: 'separator' })
        }

        template.push({
          label,
          click: () => resolve(id),
        })
      }

      const menu = Menu.buildFromTemplate(template)

      const popupOptions: Electron.PopupOptions = {
        window: mainWindow,
        callback: () => resolve(null),
      }

      if (
        typeof position === 'object' && position !== null &&
        'x' in position && 'y' in position
      ) {
        const { x, y } = position as { x: number; y: number }
        if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
          popupOptions.x = Math.floor(x)
          popupOptions.y = Math.floor(y)
        }
      }

      menu.popup(popupOptions)
    })
  })

  // --- Theme handlers ---

  safeOn('theme:set', (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
  })

  safeHandle('theme:getNativeTheme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    mainWindow.webContents.send(
      'theme:nativeThemeChange',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })
}

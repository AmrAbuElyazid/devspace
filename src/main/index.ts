import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { syncShellEnvironment } from './shell-env'
import { TerminalManager } from './terminal-manager'
import { VscodeServerManager } from './vscode-server'
import { T3CodeServerManager } from './t3code-server'
import { registerIpcHandlers } from './ipc-handlers'
import { BrowserSessionManager } from './browser/browser-session-manager'
import { BrowserPaneManager } from './browser/browser-pane-manager'
import { BrowserHistoryService } from './browser/browser-history-service'
import { BrowserImportService } from './browser/browser-import-service'
import { installWindowZoomReset } from './window-zoom'
import { getTrafficLightPosition } from './window-chrome'

// Sync shell environment before app is ready (macOS GUI apps don't inherit login shell env)
syncShellEnvironment()

const terminalManager = new TerminalManager()
let vscodeServerManager: VscodeServerManager
let t3codeServerManager: T3CodeServerManager
const browserSessionManager = new BrowserSessionManager()

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason)
})

function createWindow(): void {
  const browserHistoryService = new BrowserHistoryService({
    appDataPath: app.getPath('userData'),
  })
  const browserImportService = new BrowserImportService({
    sessionManager: browserSessionManager,
    historyService: browserHistoryService,
  })
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: getTrafficLightPosition(true),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  // Deny all new window requests
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  const browserPaneManager = new BrowserPaneManager({
    addChildView: (view) => mainWindow.contentView.addChildView(view),
    removeChildView: (view) => mainWindow.contentView.removeChildView(view),
    sendToRenderer: (channel, payload) => mainWindow.webContents.send(channel, payload),
    getSession: () => browserSessionManager.getSession(),
    historyService: browserHistoryService,
  })

  browserSessionManager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => browserPaneManager.resolvePaneIdForWebContents(webContentsId),
    requestBrowserPermission: (request, resolve) => {
      browserPaneManager.requestPermission(request, resolve)
    },
    reportCertificateError: (paneId, url) => {
      browserPaneManager.reportFailure(paneId, {
        kind: 'navigation',
        detail: 'Certificate error',
        url,
      }, {
        title: 'Certificate error',
        isSecure: false,
        securityLabel: 'Certificate error',
      })
    },
  })

  terminalManager.init(mainWindow)
  registerIpcHandlers(mainWindow, terminalManager, browserPaneManager, vscodeServerManager, t3codeServerManager, browserImportService, browserSessionManager)
  installWindowZoomReset(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Notify renderer when the window regains focus so it can re-focus
  // the active terminal surface (macOS restores focus to the web content
  // view, not the previously-focused GhosttyView).
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window:focus')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  vscodeServerManager = new VscodeServerManager()
  t3codeServerManager = new T3CodeServerManager()

  // Session-level setup — runs once, NOT per-window.
  // protocol.handle('http', ...) can only be registered once per session.
  browserSessionManager.persistSessionCookies()
  browserSessionManager.installCorsOverrides()
  browserSessionManager.registerSecretKeyHandler()

  createWindow()

  // Set application menu with Edit menu for native view responder chain.
  // App-level shortcuts are registered as menu accelerators so they fire
  // even when a native GhosttyView has keyboard focus.
  const send = (channel: string, ...args: unknown[]): void => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.send(channel, ...args)
  }

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('app:toggle-settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'Cmd+T', click: () => send('app:new-tab') },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: () => send('app:close-tab') },
        { label: 'New Workspace', accelerator: 'Cmd+N', click: () => send('app:new-workspace') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'Cmd+B', click: () => send('app:toggle-sidebar') },
        { type: 'separator' },
        { label: 'Split Right', accelerator: 'Cmd+D', click: () => send('app:split-right') },
        { label: 'Split Down', accelerator: 'Cmd+Shift+D', click: () => send('app:split-down') },
        { type: 'separator' },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Tab ${n}`,
          accelerator: `Cmd+${n}`,
          click: () => send('app:switch-tab', n),
          visible: false, // hidden from menu but accelerator still works
        })),
      ],
    },
    {
      label: 'Browser',
      submenu: [
        { label: 'Focus Address Bar', accelerator: 'Cmd+L', click: () => send('app:browser-focus-url') },
        { label: 'Reload', accelerator: 'Cmd+R', click: () => send('app:browser-reload') },
        { label: 'Back', accelerator: 'Cmd+[', click: () => send('app:browser-back') },
        { label: 'Forward', accelerator: 'Cmd+]', click: () => send('app:browser-forward') },
        { label: 'Find', accelerator: 'Cmd+F', click: () => send('app:browser-find') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'Cmd+=', click: () => send('app:browser-zoom-in') },
        { label: 'Zoom Out', accelerator: 'Cmd+-', click: () => send('app:browser-zoom-out') },
        { label: 'Reset Zoom', accelerator: 'Cmd+0', click: () => send('app:browser-zoom-reset') },
        { type: 'separator' },
        { label: 'Developer Tools', accelerator: 'Cmd+Alt+I', click: () => send('app:browser-devtools') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

let isQuitting = false
app.on('before-quit', (event) => {
  terminalManager.destroyAll()
  if (isQuitting) return // already shutting down, let quit proceed
  isQuitting = true
  // stopAll() is async — prevent immediate quit, wait for graceful
  // shutdown, then re-trigger quit.
  event.preventDefault()
  Promise.all([
    vscodeServerManager.stopAll(),
    t3codeServerManager.stopAll(),
  ]).finally(() => {
    app.quit()
  })
})

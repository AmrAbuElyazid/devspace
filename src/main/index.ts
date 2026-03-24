import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { syncShellEnvironment } from './shell-env'
import { PtyManager } from './pty-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { BrowserSessionManager } from './browser/browser-session-manager'
import { BrowserPaneManager } from './browser/browser-pane-manager'
import { BrowserHistoryService } from './browser/browser-history-service'
import { BrowserImportService } from './browser/browser-import-service'
import { installWindowZoomReset } from './window-zoom'

// Sync shell environment before app is ready (macOS GUI apps don't inherit login shell env)
syncShellEnvironment()

const ptyManager = new PtyManager()
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
    trafficLightPosition: { x: 16, y: 18 },
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

  registerIpcHandlers(mainWindow, ptyManager, browserPaneManager, browserImportService)
  installWindowZoomReset(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.destroyAll()
})

import { expect, mock, test } from 'bun:test'

const handlers = new Map()
const controllerCalls = []
const browserImportCalls = []
const mainWindowCalls = []

mock.module('electron', () => ({
  ipcMain: {
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    on: (channel, handler) => {
      handlers.set(channel, handler)
    },
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
  shell: {
    openExternal: () => {},
  },
  Menu: {
    buildFromTemplate: () => ({ popup: () => {} }),
  },
  BrowserWindow: class {},
}))

const { registerIpcHandlers } = await import('../ipc-handlers')

registerIpcHandlers(
  {
    webContents: { send: () => {} },
    contentView: {
      children: [
        {
          webContents: { id: 17 },
          getBounds: () => ({ x: 24, y: 44, width: 900, height: 700 }),
        },
      ],
    },
    on: () => {},
    minimize: () => {},
    isMaximized: () => false,
    unmaximize: () => {},
    maximize: () => {},
    setWindowButtonPosition: (position) => {
      mainWindowCalls.push(['setWindowButtonPosition', position])
    },
    close: () => {},
  },
  {
    createSurface: () => {},
    destroySurface: () => {},
    showSurface: () => {},
    hideSurface: () => {},
    focusSurface: () => {},
    setBounds: () => {},
    onTitleChanged: () => {},
    onSurfaceClosed: () => {},
    destroyAll: () => {},
  },
  {
    createPane: () => {},
    destroyPane: () => {},
    showPane: () => {},
    hidePane: () => {},
    getRuntimeState: () => undefined,
    navigate: () => {},
    back: () => {},
    forward: () => {},
    reload: () => {},
    stop: () => {},
    setBounds: (paneId, bounds) => {
      controllerCalls.push(['setBounds', paneId, bounds])
    },
    focusPane: () => {},
    setZoom: () => {},
    resetZoom: () => {},
    findInPage: () => {},
    stopFindInPage: () => {},
    toggleDevTools: () => {},
    showContextMenu: () => {},
    resolvePermission: (requestToken, decision) => {
      controllerCalls.push(['resolvePermission', requestToken, decision])
    },
  },
  {
    isAvailable: () => false,
    start: async () => ({ error: 'test' }),
    release: () => {},
    stopAll: () => {},
  },
  {
    listChromeProfiles: async () => [{ name: 'Profile 1', path: '/tmp/Profile 1' }],
    importChrome: async (profilePath, mode) => {
      browserImportCalls.push(['importChrome', profilePath, mode])
      return { ok: true, importedCookies: 0, importedHistory: 0 }
    },
    importSafari: async (mode) => {
      browserImportCalls.push(['importSafari', mode])
      return { ok: true, importedCookies: 0, importedHistory: 0 }
    },
    detectSafariAccess: async () => ({ ok: true }),
  },
)

test('browser resolvePermission IPC accepts spec permission choices', async () => {
  controllerCalls.length = 0

  await handlers.get('browser:resolvePermission')({}, 'token-1', 'allow-once')

  expect(controllerCalls).toEqual([['resolvePermission', 'token-1', 'allow-once']])
})

test('browser setBounds translates renderer viewport bounds into contentView coordinates', async () => {
  controllerCalls.length = 0

  await handlers.get('browser:setBounds')(
    { sender: { id: 17, getZoomFactor: () => 1 } },
    'pane-1',
    { x: 100, y: 200, width: 640, height: 480 },
  )

  expect(controllerCalls).toEqual([
    ['setBounds', 'pane-1', { x: 124, y: 244, width: 640, height: 480 }],
  ])
})

test('browser import IPC forwards supported import modes', async () => {
  browserImportCalls.length = 0

  await handlers.get('browser:importChrome')({}, '/tmp/Profile 1', 'history')
  await handlers.get('browser:importSafari')({}, 'cookies')

  expect(browserImportCalls).toEqual([
    ['importChrome', '/tmp/Profile 1', 'history'],
    ['importSafari', 'cookies'],
  ])
})

test('browser import IPC rejects Chrome profile paths outside discovered profiles', async () => {
  browserImportCalls.length = 0

  const result = await handlers.get('browser:importChrome')({}, '/tmp/not-a-real-profile', 'history')

  expect(result).toEqual({ ok: false, code: 'INVALID_CHROME_PROFILE', importedCookies: 0, importedHistory: 0 })
  expect(browserImportCalls).toEqual([])
})

test('window setSidebarOpen IPC updates native traffic light position', async () => {
  mainWindowCalls.length = 0

  await handlers.get('window:setSidebarOpen')({}, false)
  await handlers.get('window:setSidebarOpen')({}, true)

  expect(mainWindowCalls).toEqual([
    ['setWindowButtonPosition', { x: 16, y: 6 }],
    ['setWindowButtonPosition', { x: 16, y: 18 }],
  ])
})

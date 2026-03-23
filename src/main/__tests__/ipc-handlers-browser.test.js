import { expect, mock, test } from 'bun:test'

test('browser resolvePermission IPC accepts spec permission choices', async () => {
  const handlers = new Map()
  const controllerCalls = []

  mock.module('electron', () => ({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      },
      on: () => {},
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    shell: {
      openExternal: () => {},
    },
    nativeTheme: {
      themeSource: 'system',
      shouldUseDarkColors: false,
      on: () => {},
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
      on: () => {},
      minimize: () => {},
      isMaximized: () => false,
      unmaximize: () => {},
      maximize: () => {},
      close: () => {},
    },
    {
      create: () => 'pty-1',
      write: () => {},
      resize: () => {},
      destroy: () => {},
      onData: () => {},
      onExit: () => {},
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
      setBounds: () => {},
      focusPane: () => {},
      setZoom: () => {},
      resetZoom: () => {},
      findInPage: () => {},
      stopFindInPage: () => {},
      toggleDevTools: () => {},
      showContextMenu: () => {},
      resolvePermission: (requestToken, decision) => {
        controllerCalls.push([requestToken, decision])
      },
    },
  )

  await handlers.get('browser:resolvePermission')({}, 'token-1', 'allow-once')

  expect(controllerCalls).toEqual([['token-1', 'allow-once']])
})

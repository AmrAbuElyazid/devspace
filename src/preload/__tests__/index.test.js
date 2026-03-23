import { expect, mock, test } from 'bun:test'

test('browser bridge exposes spec-aligned browser IPC methods', async () => {
  const invokeCalls = []
  const listenerRegistrations = []
  let exposedBridge

  mock.module('electron', () => ({
    contextBridge: {
      exposeInMainWorld: (_key, bridge) => {
        exposedBridge = bridge
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invokeCalls.push(args)
        return Promise.resolve(undefined)
      },
      send: () => {},
      on: (channel) => {
        listenerRegistrations.push(['on', channel])
      },
      removeListener: (channel) => {
        listenerRegistrations.push(['removeListener', channel])
      },
    },
  }))

  await import('../index')

  await exposedBridge.browser.show('pane-1')
  await exposedBridge.browser.hide('pane-1')
  await exposedBridge.browser.getRuntimeState('pane-1')
  await exposedBridge.browser.navigate('pane-1', 'https://example.com')
  await exposedBridge.browser.back('pane-1')
  await exposedBridge.browser.forward('pane-1')
  await exposedBridge.browser.toggleDevTools('pane-1')
  await exposedBridge.browser.resetZoom('pane-1')
  await exposedBridge.browser.showContextMenu('pane-1', { x: 10, y: 20 })
  await exposedBridge.browser.resolvePermission('token-1', 'granted')
  const unsubscribeState = exposedBridge.browser.onStateChange(() => {})
  const unsubscribePermission = exposedBridge.browser.onPermissionRequest(() => {})
  unsubscribeState()
  unsubscribePermission()

  expect(invokeCalls).toEqual([
    ['browser:show', 'pane-1'],
    ['browser:hide', 'pane-1'],
    ['browser:getRuntimeState', 'pane-1'],
    ['browser:navigate', 'pane-1', 'https://example.com'],
    ['browser:back', 'pane-1'],
    ['browser:forward', 'pane-1'],
    ['browser:toggleDevTools', 'pane-1'],
    ['browser:resetZoom', 'pane-1'],
    ['browser:showContextMenu', 'pane-1', { x: 10, y: 20 }],
    ['browser:resolvePermission', 'token-1', 'granted'],
  ])

  expect(listenerRegistrations).toEqual([
    ['on', 'browser:stateChanged'],
    ['on', 'browser:permissionRequested'],
    ['removeListener', 'browser:stateChanged'],
    ['removeListener', 'browser:permissionRequested'],
  ])
})

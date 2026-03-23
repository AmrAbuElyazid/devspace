import { expect, mock, test } from 'bun:test'

test('browser bridge exposes pane visibility and runtime-state IPC methods', async () => {
  const invokeCalls = []
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
      on: () => {},
      removeListener: () => {},
    },
  }))

  await import('../index')

  await exposedBridge.browser.showPane('pane-1')
  await exposedBridge.browser.hidePane('pane-1')
  await exposedBridge.browser.getRuntimeState('pane-1')

  expect(invokeCalls).toEqual([
    ['browser:showPane', 'pane-1'],
    ['browser:hidePane', 'pane-1'],
    ['browser:getRuntimeState', 'pane-1'],
  ])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { BrowserPaneManager } from '../browser-pane-manager'

function makeManager(): BrowserPaneManager {
  return new BrowserPaneManager({
    createView: () => ({ webContents: {} }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  })
}

test('tracks pane lifecycle bookkeeping across create show hide and destroy', () => {
  const childViews: unknown[] = []
  const rendererMessages: Array<{ channel: string; payload: unknown }> = []
  let destroyed = false
  const view = {
    webContents: {
      close: () => {
        destroyed = true
      },
    },
  }

  const manager = new BrowserPaneManager({
    createView: () => view as never,
    addChildView: (nextView) => {
      childViews.push(nextView)
    },
    removeChildView: (nextView) => {
      const index = childViews.indexOf(nextView)
      if (index >= 0) {
        childViews.splice(index, 1)
      }
    },
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload })
    },
  })

  manager.createPane('pane-1', 'https://example.com')

  assert.equal(manager.getRuntimeState('pane-1')?.paneId, 'pane-1')
  assert.equal(manager.getRuntimeState('pane-1')?.url, 'https://example.com')
  assert.deepEqual(childViews, [])
  assert.equal(rendererMessages.length, 1)
  assert.equal(rendererMessages[0]?.channel, 'browser:stateChanged')

  manager.showPane('pane-1')

  assert.deepEqual(childViews, [view])

  manager.hidePane('pane-1')

  assert.deepEqual(childViews, [])

  manager.showPane('pane-1')
  manager.destroyPane('pane-1')

  assert.deepEqual(childViews, [])
  assert.equal(destroyed, true)
  assert.equal(manager.getRuntimeState('pane-1'), undefined)
})

test('hidePane preserves runtime state and visibility bookkeeping', () => {
  const manager = makeManager()

  manager.createPane('pane-1', 'https://example.com')
  manager.showPane('pane-1')
  manager.hidePane('pane-1')

  assert.equal(manager.getRuntimeState('pane-1')?.url, 'https://example.com')
  assert.equal(manager.isPaneVisible('pane-1'), false)
})

test('runtime updates capture title, favicon, and loading state', () => {
  const manager = makeManager()
  manager.createPane('pane-1', 'https://example.com')
  manager.applyRuntimePatch('pane-1', { title: 'Example', faviconUrl: 'https://example.com/favicon.ico', isLoading: true })

  assert.equal(manager.getRuntimeState('pane-1')?.title, 'Example')
  assert.equal(manager.getRuntimeState('pane-1')?.faviconUrl, 'https://example.com/favicon.ico')
  assert.equal(manager.getRuntimeState('pane-1')?.isLoading, true)
})

test('navigate keeps persisted runtime url unchanged until navigation commits', () => {
  const loadCalls: string[] = []
  const manager = new BrowserPaneManager({
    createView: () => ({
      webContents: {
        loadURL: (url: string) => {
          loadCalls.push(url)
        },
      },
    }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  })

  manager.createPane('pane-1', 'https://example.com')
  manager.navigate('pane-1', 'https://next.example.com')

  assert.deepEqual(loadCalls, ['https://example.com', 'https://next.example.com'])
  assert.equal(manager.getRuntimeState('pane-1')?.url, 'https://example.com')
})

test('failed navigation does not replace the committed runtime url', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const manager = new BrowserPaneManager({
    createView: () => ({
      webContents: {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          listeners.set(event, listener)
        },
        loadURL: () => Promise.resolve(),
      },
    }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  })

  manager.createPane('pane-1', 'https://example.com')
  listeners.get('did-fail-load')?.({}, -105, 'NAME_NOT_RESOLVED', 'https://bad.example', true)

  const runtimeState = manager.getRuntimeState('pane-1')
  assert.equal(runtimeState?.url, 'https://example.com')
  assert.equal(runtimeState?.title, 'NAME_NOT_RESOLVED')
})

test('explicit certificate error security state is preserved on runtime patch', () => {
  const manager = makeManager()

  manager.createPane('pane-1', 'https://example.com')
  manager.applyRuntimePatch('pane-1', {
    url: 'https://expired.badssl.com/',
    isSecure: false,
    securityLabel: 'Certificate error',
  })

  const runtimeState = manager.getRuntimeState('pane-1')
  assert.equal(runtimeState?.isSecure, false)
  assert.equal(runtimeState?.securityLabel, 'Certificate error')
})

test('find result updates active and total matches', () => {
  const manager = makeManager()

  manager.createPane('pane-1', 'https://example.com')
  manager.applyFindResult('pane-1', { query: 'hello', activeMatch: 2, totalMatches: 5 })

  assert.deepEqual(manager.getRuntimeState('pane-1')?.find, {
    query: 'hello',
    activeMatch: 2,
    totalMatches: 5,
  })
})

test('found-in-page event updates stored match counts', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const manager = new BrowserPaneManager({
    createView: () => ({
      webContents: {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          listeners.set(event, listener)
        },
        loadURL: () => Promise.resolve(),
      },
    }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  })

  manager.createPane('pane-1', 'https://example.com')
  manager.findInPage('pane-1', 'hello')
  listeners.get('found-in-page')?.({}, { activeMatchOrdinal: 2, matches: 5 })

  assert.deepEqual(manager.getRuntimeState('pane-1')?.find, {
    query: 'hello',
    activeMatch: 2,
    totalMatches: 5,
  })
})

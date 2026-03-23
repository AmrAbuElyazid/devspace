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

import assert from 'node:assert/strict'
import test from 'node:test'
import { BrowserPaneManager } from '../browser-pane-manager'

test('tracks runtime state for created panes', () => {
  const manager = new BrowserPaneManager({
    createView: () => ({ webContents: {} }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  })

  manager.createPane('pane-1', 'https://example.com')

  assert.equal(manager.getRuntimeState('pane-1')?.url, 'https://example.com')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldHideBrowserNativeViewForDrag } from '../lib/browser-pane-visibility'

test('shouldHideBrowserNativeViewForDrag only hides during active group-tab drag on the visible tab', () => {
  assert.equal(shouldHideBrowserNativeViewForDrag({ type: 'group-tab', workspaceId: 'ws-1', groupId: 'group-1', tabId: 'tab-1' }, true), true)
  assert.equal(shouldHideBrowserNativeViewForDrag({ type: 'sidebar-workspace', workspaceId: 'ws-1' }, true), false)
  assert.equal(shouldHideBrowserNativeViewForDrag(null, true), false)
  assert.equal(shouldHideBrowserNativeViewForDrag({ type: 'group-tab', workspaceId: 'ws-1', groupId: 'group-1', tabId: 'tab-1' }, false), false)
})

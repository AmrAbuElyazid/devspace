import test from 'node:test'
import assert from 'node:assert/strict'
import { getActiveFocusedBrowserPane, getSplitShortcutTargetGroupId } from './browser-shortcuts'

test('returns the focused browser pane via the active group tab', () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        name: 'Workspace 1',
        root: { type: 'leaf', groupId: 'group-1' },
        focusedGroupId: 'group-1',
      },
    ],
    panes: {
      'pane-1': { id: 'pane-1', type: 'browser', title: 'Browser', config: { url: 'https://one.example' } },
      'pane-2': { id: 'pane-2', type: 'browser', title: 'Browser', config: { url: 'https://two.example' } },
    },
    paneGroups: {
      'group-1': {
        id: 'group-1',
        tabs: [
          { id: 'tab-1', paneId: 'pane-1' },
          { id: 'tab-2', paneId: 'pane-2' },
        ],
        activeTabId: 'tab-2',
      },
    },
  })

  assert.equal(pane?.id, 'pane-2')
})

test('returns null when no group is focused', () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        name: 'Workspace 1',
        root: { type: 'leaf', groupId: 'group-1' },
        focusedGroupId: null,
      },
    ],
    panes: {
      'pane-1': { id: 'pane-1', type: 'browser', title: 'Browser', config: { url: 'https://one.example' } },
    },
    paneGroups: {
      'group-1': {
        id: 'group-1',
        tabs: [{ id: 'tab-1', paneId: 'pane-1' }],
        activeTabId: 'tab-1',
      },
    },
  })

  assert.equal(pane, null)
})

test('split shortcuts fall back to the first group when no group is focused', () => {
  const groupId = getSplitShortcutTargetGroupId({
    id: 'ws-1',
    name: 'Workspace 1',
    focusedGroupId: null,
    root: {
      type: 'branch',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { type: 'leaf', groupId: 'group-1' },
        { type: 'leaf', groupId: 'group-2' },
      ],
    },
  })

  assert.equal(groupId, 'group-1')
})

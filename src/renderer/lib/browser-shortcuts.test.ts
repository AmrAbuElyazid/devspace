import test from 'node:test'
import assert from 'node:assert/strict'
import { getActiveFocusedBrowserPane, getSplitShortcutTargetPaneId } from './browser-shortcuts'

test('returns the explicitly focused browser pane', () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        name: 'Workspace 1',
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            name: 'Tab 1',
            focusedPaneId: 'pane-2',
            root: { type: 'leaf', paneId: 'pane-1' },
          },
        ],
      },
    ],
    panes: {
      'pane-1': { id: 'pane-1', type: 'browser', title: 'Browser', config: { url: 'https://one.example' } },
      'pane-2': { id: 'pane-2', type: 'browser', title: 'Browser', config: { url: 'https://two.example' } },
    },
  })

  assert.equal(pane?.id, 'pane-2')
})

test('does not fall back to the first browser leaf when no pane is focused', () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        name: 'Workspace 1',
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            name: 'Tab 1',
            focusedPaneId: null,
            root: { type: 'leaf', paneId: 'pane-1' },
          },
        ],
      },
    ],
    panes: {
      'pane-1': { id: 'pane-1', type: 'browser', title: 'Browser', config: { url: 'https://one.example' } },
    },
  })

  assert.equal(pane, null)
})

test('split shortcuts fall back to the first leaf when no pane is focused', () => {
  const paneId = getSplitShortcutTargetPaneId({
    id: 'tab-1',
    name: 'Tab 1',
    focusedPaneId: null,
    root: {
      type: 'branch',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { type: 'leaf', paneId: 'pane-1' },
        { type: 'leaf', paneId: 'pane-2' },
      ],
    },
  })

  assert.equal(paneId, 'pane-1')
})

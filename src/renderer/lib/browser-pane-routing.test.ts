import test from 'node:test'
import assert from 'node:assert/strict'
import { findWorkspaceIdForPane } from './browser-pane-routing'

test('findWorkspaceIdForPane returns the owning workspace for a background pane', () => {
  const workspaceId = findWorkspaceIdForPane(
    [
      {
        id: 'ws-1',
        name: 'Workspace 1',
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            name: 'Tab 1',
            focusedPaneId: 'pane-1',
            root: { type: 'leaf', paneId: 'pane-1' },
          },
        ],
      },
      {
        id: 'ws-2',
        name: 'Workspace 2',
        activeTabId: 'tab-2',
        tabs: [
          {
            id: 'tab-2',
            name: 'Tab 2',
            focusedPaneId: 'pane-2',
            root: {
              type: 'branch',
              direction: 'horizontal',
              sizes: [50, 50],
              children: [
                { type: 'leaf', paneId: 'pane-2' },
                { type: 'leaf', paneId: 'pane-3' },
              ],
            },
          },
        ],
      },
    ],
    'pane-3',
  )

  assert.equal(workspaceId, 'ws-2')
})

test('findWorkspaceIdForPane returns null when a pane is not owned by any workspace', () => {
  const workspaceId = findWorkspaceIdForPane([], 'missing-pane')
  assert.equal(workspaceId, null)
})

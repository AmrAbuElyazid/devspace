import test from 'node:test'
import assert from 'node:assert/strict'
import { findWorkspaceIdForPane } from './browser-pane-routing'
import type { Workspace, PaneGroup } from '../types/workspace'

test('findWorkspaceIdForPane returns the owning workspace for a background pane', () => {
  const paneGroups: Record<string, PaneGroup> = {
    'group-1': { id: 'group-1', tabs: [{ id: 'tab-1', paneId: 'pane-1' }], activeTabId: 'tab-1' },
    'group-2': { id: 'group-2', tabs: [{ id: 'tab-2', paneId: 'pane-2' }], activeTabId: 'tab-2' },
    'group-3': { id: 'group-3', tabs: [{ id: 'tab-3', paneId: 'pane-3' }], activeTabId: 'tab-3' },
  }

  const workspaces: Workspace[] = [
    {
      id: 'ws-1',
      name: 'Workspace 1',
      root: { type: 'leaf', groupId: 'group-1' },
      focusedGroupId: 'group-1',
    },
    {
      id: 'ws-2',
      name: 'Workspace 2',
      root: {
        type: 'branch',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [
          { type: 'leaf', groupId: 'group-2' },
          { type: 'leaf', groupId: 'group-3' },
        ],
      },
      focusedGroupId: 'group-2',
    },
  ]

  const workspaceId = findWorkspaceIdForPane(workspaces, 'pane-3', paneGroups)
  assert.equal(workspaceId, 'ws-2')
})

test('findWorkspaceIdForPane returns null when a pane is not owned by any workspace', () => {
  const workspaceId = findWorkspaceIdForPane([], 'missing-pane', {})
  assert.equal(workspaceId, null)
})

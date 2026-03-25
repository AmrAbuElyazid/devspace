import test from 'node:test'
import assert from 'node:assert/strict'
import { validateWorkspaceGraph } from './workspace-graph'
import type { Pane, PaneGroup, Workspace } from '../types/workspace'

function makeWorkspace(id: string, groupId: string): Workspace {
  return {
    id,
    name: id,
    root: { type: 'leaf', groupId },
    focusedGroupId: groupId,
    pinned: false,
    lastActiveAt: Date.now(),
  }
}

function makeGroup(id: string, paneId: string): PaneGroup {
  return {
    id,
    tabs: [{ id: `tab-${id}`, paneId }],
    activeTabId: `tab-${id}`,
  }
}

function makePane(id: string): Pane {
  return {
    id,
    type: 'empty',
    title: 'Empty',
    config: {},
  }
}

test('validateWorkspaceGraph accepts a simple valid snapshot', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [makeWorkspace('ws-1', 'group-1')],
    paneGroups: { 'group-1': makeGroup('group-1', 'pane-1') },
    panes: { 'pane-1': makePane('pane-1') },
  })

  assert.equal(result.valid, true)
})

test('validateWorkspaceGraph rejects focused groups outside the tree', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [{ ...makeWorkspace('ws-1', 'group-1'), focusedGroupId: 'missing-group' }],
    paneGroups: { 'group-1': makeGroup('group-1', 'pane-1') },
    panes: { 'pane-1': makePane('pane-1') },
  })

  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /focusedGroupId/)
})

test('validateWorkspaceGraph rejects groups shared by multiple workspaces', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [makeWorkspace('ws-1', 'group-1'), makeWorkspace('ws-2', 'group-1')],
    paneGroups: { 'group-1': makeGroup('group-1', 'pane-1') },
    panes: { 'pane-1': makePane('pane-1') },
  })

  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /multiple workspaces/)
})

test('validateWorkspaceGraph rejects groups with invalid active tabs', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [makeWorkspace('ws-1', 'group-1')],
    paneGroups: {
      'group-1': {
        id: 'group-1',
        tabs: [{ id: 'tab-1', paneId: 'pane-1' }],
        activeTabId: 'missing-tab',
      },
    },
    panes: { 'pane-1': makePane('pane-1') },
  })

  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /activeTabId/)
})

test('validateWorkspaceGraph rejects tabs that point at missing panes', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [makeWorkspace('ws-1', 'group-1')],
    paneGroups: { 'group-1': makeGroup('group-1', 'missing-pane') },
    panes: {},
  })

  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /missing pane/)
})

test('validateWorkspaceGraph rejects malformed split sizes', () => {
  const result = validateWorkspaceGraph({
    activeWorkspaceId: 'ws-1',
    workspaces: [{
      ...makeWorkspace('ws-1', 'group-1'),
      root: {
        type: 'branch',
        direction: 'horizontal',
        children: [
          { type: 'leaf', groupId: 'group-1' },
          { type: 'leaf', groupId: 'group-2' },
        ],
        sizes: [100],
      },
    }],
    paneGroups: {
      'group-1': makeGroup('group-1', 'pane-1'),
      'group-2': makeGroup('group-2', 'pane-2'),
    },
    panes: {
      'pane-1': makePane('pane-1'),
      'pane-2': makePane('pane-2'),
    },
  })

  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /sizes/)
})

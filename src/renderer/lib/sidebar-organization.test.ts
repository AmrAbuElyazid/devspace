import test from 'node:test'
import assert from 'node:assert/strict'
import type { SidebarNode } from '../types/workspace'
import { normalizeSidebarPersistence, repairSidebarOrganization } from './sidebar-organization'

function folder(id: string, name: string, children: SidebarNode[] = []): SidebarNode {
  return {
    type: 'folder',
    id,
    name,
    collapsed: false,
    children,
  }
}

test('repairSidebarOrganization removes duplicate workspace occurrences after the first valid one', () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: 'ws-1' }, { id: 'ws-2' }],
    pinnedSidebarNodes: [{ type: 'workspace', workspaceId: 'ws-1' }],
    sidebarTree: [
      { type: 'workspace', workspaceId: 'ws-1' },
      { type: 'workspace', workspaceId: 'ws-2' },
    ],
  })

  assert.deepEqual(repaired.pinnedSidebarNodes, [{ type: 'workspace', workspaceId: 'ws-1' }])
  assert.deepEqual(repaired.sidebarTree, [{ type: 'workspace', workspaceId: 'ws-2' }])
})

test('repairSidebarOrganization drops orphaned workspace references and appends missing workspaces to main tree', () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: 'ws-1' }, { id: 'ws-2' }],
    pinnedSidebarNodes: [{ type: 'workspace', workspaceId: 'missing' }],
    sidebarTree: [],
  })

  assert.deepEqual(repaired.pinnedSidebarNodes, [])
  assert.deepEqual(repaired.sidebarTree, [
    { type: 'workspace', workspaceId: 'ws-1' },
    { type: 'workspace', workspaceId: 'ws-2' },
  ])
})

test('repairSidebarOrganization keeps the first folder id occurrence and drops later duplicates', () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: 'ws-1' }],
    pinnedSidebarNodes: [folder('folder-1', 'Pinned Folder')],
    sidebarTree: [folder('folder-1', 'Duplicate Folder', [{ type: 'workspace', workspaceId: 'ws-1' }])],
  })

  assert.deepEqual(repaired.pinnedSidebarNodes, [folder('folder-1', 'Pinned Folder')])
  assert.deepEqual(repaired.sidebarTree, [{ type: 'workspace', workspaceId: 'ws-1' }])
})

test('repairSidebarOrganization drops cyclical folder insertion points', () => {
  const repaired = repairSidebarOrganization({
    workspaces: [],
    pinnedSidebarNodes: [],
    sidebarTree: [
      folder('folder-1', 'Parent', [
        folder('folder-2', 'Child', [
          folder('folder-1', 'Cycle'),
        ]),
      ]),
    ],
  })

  assert.deepEqual(repaired.sidebarTree, [
    folder('folder-1', 'Parent', [
      folder('folder-2', 'Child'),
    ]),
  ])
})

test('normalizeSidebarPersistence initializes missing pinnedSidebarNodes to an empty array', () => {
  const normalized = normalizeSidebarPersistence({
    workspaces: [{ id: 'ws-1' }],
    sidebarTree: [{ type: 'workspace', workspaceId: 'ws-1' }],
  })

  assert.deepEqual(normalized.pinnedSidebarNodes, [])
  assert.deepEqual(normalized.sidebarTree, [{ type: 'workspace', workspaceId: 'ws-1' }])
})

test('normalizeSidebarPersistence migrates legacy pinned workspaces into pinnedSidebarNodes without duplication', () => {
  const normalized = normalizeSidebarPersistence({
    workspaces: [
      { id: 'ws-1', pinned: true },
      { id: 'ws-2' },
    ],
    pinnedSidebarNodes: [],
    sidebarTree: [
      { type: 'workspace', workspaceId: 'ws-1' },
      { type: 'workspace', workspaceId: 'ws-2' },
    ],
  })

  assert.deepEqual(normalized.pinnedSidebarNodes, [{ type: 'workspace', workspaceId: 'ws-1' }])
  assert.deepEqual(normalized.sidebarTree, [{ type: 'workspace', workspaceId: 'ws-2' }])
})

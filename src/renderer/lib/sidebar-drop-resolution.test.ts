import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSidebarDrop } from './sidebar-drop-resolution'

test('resolves folder center drop as move into folder', () => {
  const resolution = resolveSidebarDrop({
    active: { type: 'sidebar-workspace', workspaceId: 'ws-a', container: 'main', parentFolderId: null },
    over: { type: 'sidebar-folder', folderId: 'folder-1', container: 'main', parentFolderId: null },
    pointer: { x: 50, y: 50 },
    rects: {
      'folder-folder-1': { left: 0, top: 0, width: 100, height: 100 },
    },
    folderChildCounts: {
      'folder-1': 2,
    },
  })

  assert.deepEqual(resolution, {
    targetContainer: 'main',
    targetParentId: 'folder-1',
    targetIndex: 2,
  })
})

test('resolves folder center drop using current child count for append', () => {
  const resolution = resolveSidebarDrop({
    active: { type: 'sidebar-workspace', workspaceId: 'ws-z', container: 'main', parentFolderId: null },
    over: { type: 'sidebar-folder', folderId: 'folder-2', container: 'main', parentFolderId: null },
    pointer: { x: 60, y: 60 },
    rects: {
      'folder-folder-2': { left: 0, top: 0, width: 120, height: 120 },
    },
    folderChildCounts: {
      'folder-2': 1,
    },
  })

  assert.deepEqual(resolution, {
    targetContainer: 'main',
    targetParentId: 'folder-2',
    targetIndex: 1,
  })
})

test('resolves edge drop on folder as sibling insert', () => {
  const resolution = resolveSidebarDrop({
    active: { type: 'sidebar-workspace', workspaceId: 'ws-a', container: 'main', parentFolderId: null },
    over: { type: 'sidebar-folder', folderId: 'folder-1', container: 'main', parentFolderId: null },
    pointer: { x: 50, y: 10 },
    rects: {
      'folder-folder-1': { left: 0, top: 0, width: 100, height: 100 },
    },
    siblingIds: {
      main: ['folder-1', 'ws-b'],
    },
    folderChildCounts: {
      'folder-1': 2,
    },
  })

  assert.deepEqual(resolution, {
    targetContainer: 'main',
    targetParentId: null,
    targetIndex: 0,
  })
})

test('resolves drop on pinned root as append to pinned container', () => {
  const resolution = resolveSidebarDrop({
    active: { type: 'sidebar-workspace', workspaceId: 'ws-a', container: 'main', parentFolderId: null },
    over: { type: 'sidebar-root', container: 'pinned' },
    pointer: { x: 10, y: 10 },
    rootCounts: { main: 1, pinned: 0 },
  })

  assert.deepEqual(resolution, {
    targetContainer: 'pinned',
    targetParentId: null,
    targetIndex: 0,
  })
})

test('resolves drop on main root as append to main container', () => {
  const resolution = resolveSidebarDrop({
    active: { type: 'sidebar-workspace', workspaceId: 'ws-a', container: 'pinned', parentFolderId: null },
    over: { type: 'sidebar-root', container: 'main' },
    pointer: { x: 10, y: 10 },
    rootCounts: { main: 2, pinned: 1 },
  })

  assert.deepEqual(resolution, {
    targetContainer: 'main',
    targetParentId: null,
    targetIndex: 2,
  })
})

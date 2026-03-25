import test from 'node:test'
import assert from 'node:assert/strict'
import type { CollisionDescriptor } from '@dnd-kit/core'
import { filterCollisionsForActiveDrag } from './dnd-collision-filter'
import type { DragItemData } from '../types/dnd'

function collision(type: string, id: string): CollisionDescriptor {
  return {
    id,
    data: {
      value: 1,
      droppableContainer: {
        id,
        key: id,
        disabled: false,
        rect: { current: null },
        node: { current: null },
        data: { current: { type } },
      },
    },
  }
}

test('group-tab drags ignore sidebar-folder collisions', () => {
  const active: DragItemData = {
    type: 'group-tab',
    workspaceId: 'ws-a',
    groupId: 'group-a',
    tabId: 'tab-a',
  }

  const filtered = filterCollisionsForActiveDrag(active, [
    collision('sidebar-folder', 'folder-1'),
    collision('sidebar-workspace', 'ws-b'),
  ])

  assert.deepEqual(filtered.map((entry) => entry.id), ['ws-b'])
})

test('group-tab drags prioritize group tabs over pane drops and workspace drops', () => {
  const active: DragItemData = {
    type: 'group-tab',
    workspaceId: 'ws-a',
    groupId: 'group-a',
    tabId: 'tab-a',
  }

  const filtered = filterCollisionsForActiveDrag(active, [
    collision('pane-drop', 'pane-drop-group-b'),
    collision('group-tab', 'gtab-tab-b'),
    collision('sidebar-workspace', 'ws-b'),
  ])

  assert.deepEqual(filtered.map((entry) => entry.id), ['gtab-tab-b'])
})

test('sidebar drags ignore pane-drop collisions entirely', () => {
  const active: DragItemData = {
    type: 'sidebar-workspace',
    workspaceId: 'ws-a',
    container: 'main',
    parentFolderId: null,
  }

  const filtered = filterCollisionsForActiveDrag(active, [
    collision('pane-drop', 'pane-drop-group-b'),
    collision('sidebar-folder', 'folder-1'),
  ])

  assert.deepEqual(filtered.map((entry) => entry.id), ['folder-1'])
})

test('sidebar drags keep pinned-root and main-root collisions', () => {
  const active: DragItemData = {
    type: 'sidebar-workspace',
    workspaceId: 'ws-a',
    container: 'main',
    parentFolderId: null,
  }

  const filtered = filterCollisionsForActiveDrag(active, [
    collision('sidebar-root', 'sidebar-root-main'),
    collision('sidebar-root', 'sidebar-root-pinned'),
    collision('pane-drop', 'pane-drop-group-b'),
  ])

  assert.deepEqual(filtered.map((entry) => entry.id), ['sidebar-root-main', 'sidebar-root-pinned'])
})

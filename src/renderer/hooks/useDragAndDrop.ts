import { useState, useCallback, useRef, createContext, useContext } from 'react'
import {
  useSensors,
  useSensor,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  pointerWithin,
  closestCenter,
} from '@dnd-kit/core'
import { useWorkspaceStore } from '../store/workspace-store'
import { findFolder } from '../lib/sidebar-tree'
import type { DragItemData, DropSide } from '../types/dnd'
import type { SidebarNode } from '../types/workspace'

// React context to share activeDrag state without prop drilling
export const DragContext = createContext<DragItemData | null>(null)
export const useDragContext = () => useContext(DragContext)

/**
 * Compute which side of a rectangle the pointer is closest to.
 * Used by onDragEnd to determine split direction for tab-to-pane drops.
 */
function computeDropSide(pointerX: number, pointerY: number, rect: DOMRect): DropSide {
  const relX = (pointerX - rect.left) / rect.width
  const relY = (pointerY - rect.top) / rect.height
  const dL = relX
  const dR = 1 - relX
  const dT = relY
  const dB = 1 - relY
  const min = Math.min(dL, dR, dT, dB)
  if (min === dL) return 'left'
  if (min === dR) return 'right'
  if (min === dT) return 'top'
  return 'bottom'
}

export function useDragAndDrop() {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null)
  const folderExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredFolderIdRef = useRef<string | null>(null)

  const store = useWorkspaceStore

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  // Collision detection: pointerWithin-first, then closestCenter as fallback.
  //
  // pointerWithin only matches droppable rects that CONTAIN the pointer.
  // This means:
  //   - Tab sortable items match only when pointer is over the tab bar
  //   - Pane zones match only when pointer is over the pane area
  //   - Sidebar items match only when pointer is over the sidebar
  // No filtering needed — geometry does the scoping naturally.
  //
  // closestCenter fallback handles the case where pointer is between
  // sortable items (not inside any rect but close enough for reorder).
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return closestCenter(args)
  }, [])

  const clearFolderExpandTimer = useCallback(() => {
    if (folderExpandTimerRef.current) {
      clearTimeout(folderExpandTimerRef.current)
      folderExpandTimerRef.current = null
    }
    hoveredFolderIdRef.current = null
  }, [])

  const onDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragItemData
    setActiveDrag(data)
  }, [])

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      clearFolderExpandTimer()
      return
    }

    const overData = over.data.current as Record<string, unknown> | undefined
    if (!overData) return

    // Folder auto-expand on 500ms hover
    if (overData.type === 'sidebar-folder') {
      const folderId = overData.folderId as string
      if (hoveredFolderIdRef.current !== folderId) {
        clearFolderExpandTimer()
        hoveredFolderIdRef.current = folderId
        folderExpandTimerRef.current = setTimeout(() => {
          store.getState().expandFolder(folderId)
        }, 500)
      }
    } else {
      clearFolderExpandTimer()
    }
  }, [clearFolderExpandTimer])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveDrag(null)
    clearFolderExpandTimer()

    if (!over) return

    const dragData = active.data.current as DragItemData
    const dropData = over.data.current as Record<string, unknown> | undefined
    if (!dragData || !dropData) return
    const dropType = dropData.type as string

    const state = store.getState()

    // ── Sidebar item → Sidebar item (reorder / move between levels / drop into folder) ──
    const isSidebarDrag = dragData.type === 'sidebar-workspace' || dragData.type === 'sidebar-folder'
    const isSidebarDrop = dropType === 'sidebar-workspace' || dropType === 'sidebar-folder'

    if (isSidebarDrag && isSidebarDrop) {
      const nodeId = dragData.type === 'sidebar-workspace' ? dragData.workspaceId : dragData.folderId
      const nodeType = dragData.type === 'sidebar-workspace' ? 'workspace' : 'folder'

      if (dropType === 'sidebar-folder') {
        // Dropped ON a folder → insert as last child
        const targetFolderId = dropData.folderId as string
        if (nodeType === 'folder' && nodeId === targetFolderId) return
        const folder = findFolder(state.sidebarTree as SidebarNode[], targetFolderId)
        const index = folder ? folder.children.length : 0
        state.reorderSidebarNode(nodeId, nodeType, targetFolderId, index)
        // Auto-expand the folder so user sees where the item went
        state.expandFolder(targetFolderId)
      } else {
        // Dropped ON a workspace → insert at its position
        const overParentFolderId = (dropData.parentFolderId as string | null) ?? null
        const overWsId = dropData.workspaceId as string

        const sidebarTree = state.sidebarTree as SidebarNode[]
        let parentChildren: SidebarNode[]
        if (overParentFolderId === null) {
          parentChildren = sidebarTree
        } else {
          const parentFolder = findFolder(sidebarTree, overParentFolderId)
          parentChildren = parentFolder ? parentFolder.children : sidebarTree
        }

        let overIndex = parentChildren.findIndex(
          (child) => child.type === 'workspace' && child.workspaceId === overWsId,
        )
        if (overIndex === -1) overIndex = parentChildren.length

        state.reorderSidebarNode(nodeId, nodeType, overParentFolderId, overIndex)
      }
      return
    }

    // ── Tab → Tab (reorder within same workspace) ──
    if (dragData.type === 'tab' && dropType === 'tab') {
      if (dragData.workspaceId === (dropData.workspaceId as string)) {
        const ws = state.workspaces.find((w) => w.id === dragData.workspaceId)
        if (!ws) return
        const fromIndex = ws.tabs.findIndex((t) => t.id === dragData.tabId)
        const toIndex = ws.tabs.findIndex((t) => t.id === (dropData.tabId as string))
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          state.reorderTabs(dragData.workspaceId, fromIndex, toIndex)
        }
      }
      return
    }

    // ── Tab → Sidebar workspace (cross-workspace move) ──
    if (dragData.type === 'tab' && dropType === 'sidebar-workspace-target') {
      const targetWsId = dropData.workspaceId as string
      if (dragData.workspaceId !== targetWsId) {
        state.moveTabToWorkspace(dragData.workspaceId, dragData.tabId, targetWsId)
      }
      return
    }

    // ── Tab → Pane zone (merge tab into split) ──
    if (dragData.type === 'tab' && dropType === 'pane-zone') {
      // Compute split direction from pointer position relative to pane rect.
      // This is the single source of truth — no dependency on stale React state.
      const paneId = dropData.paneId as string
      const paneEl = document.querySelector(`[data-pane-drop-id="${paneId}"]`)
      let side: DropSide = 'right'
      if (paneEl && event.activatorEvent instanceof PointerEvent) {
        // Use the last known pointer coordinates from the drag event
        const rect = paneEl.getBoundingClientRect()
        // dnd-kit doesn't expose final pointer position in onDragEnd,
        // but the activatorEvent has initial coordinates. For the final position,
        // we use the delta from the active node's transform.
        const coords = (event as any).delta
          ? { x: (event.activatorEvent as PointerEvent).clientX + (event as any).delta.x,
              y: (event.activatorEvent as PointerEvent).clientY + (event as any).delta.y }
          : { x: (event.activatorEvent as PointerEvent).clientX,
              y: (event.activatorEvent as PointerEvent).clientY }
        side = computeDropSide(coords.x, coords.y, rect)
      } else if (dropData.side) {
        // Fallback: read the side tracked by PaneContainer's pointermove listener
        side = dropData.side as DropSide
      }

      state.mergeTabIntoSplit(
        dragData.workspaceId,
        dragData.tabId,
        dropData.workspaceId as string,
        dropData.tabId as string,
        paneId,
        side,
      )
      return
    }
  }, [clearFolderExpandTimer])

  const onDragCancel = useCallback(() => {
    setActiveDrag(null)
    clearFolderExpandTimer()
  }, [clearFolderExpandTimer])

  return {
    sensors,
    collisionDetection,
    activeDrag,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}

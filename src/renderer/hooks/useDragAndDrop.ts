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

    // Helper: compute final pointer position from the drag event
    const pointerPos = event.activatorEvent instanceof PointerEvent
      ? {
          x: (event.activatorEvent as PointerEvent).clientX + event.delta.x,
          y: (event.activatorEvent as PointerEvent).clientY + event.delta.y,
        }
      : null

    // Helper: determine if pointer is in the "after" half of an element
    function isInsertAfter(sortableId: string, axis: 'vertical' | 'horizontal'): boolean {
      if (!pointerPos) return true // fallback: insert after
      const el = document.querySelector(`[data-sortable-id="${sortableId}"]`)
      if (!el) return true
      const rect = el.getBoundingClientRect()
      if (axis === 'vertical') {
        return (pointerPos.y - rect.top) / rect.height > 0.5
      }
      return (pointerPos.x - rect.left) / rect.width > 0.5
    }

    // Helper: for folders, determine if pointer is in the center zone (drop-into)
    // vs edge zones (reorder). Uses 0.25 threshold matching the useInsertionIndicator hook.
    function isFolderCenterZone(sortableId: string): boolean {
      if (!pointerPos) return true
      const el = document.querySelector(`[data-sortable-id="${sortableId}"]`)
      if (!el) return true
      const rect = el.getBoundingClientRect()
      const relY = (pointerPos.y - rect.top) / rect.height
      return relY >= 0.25 && relY <= 0.75
    }

    // ── Sidebar item → Sidebar item (reorder / move between levels / drop into folder) ──
    const isSidebarDrag = dragData.type === 'sidebar-workspace' || dragData.type === 'sidebar-folder'
    const isSidebarDrop = dropType === 'sidebar-workspace' || dropType === 'sidebar-folder'

    if (isSidebarDrag && isSidebarDrop) {
      const nodeId = dragData.type === 'sidebar-workspace' ? dragData.workspaceId : dragData.folderId
      const nodeType = dragData.type === 'sidebar-workspace' ? 'workspace' : 'folder'

      if (dropType === 'sidebar-folder') {
        const targetFolderId = dropData.folderId as string
        if (nodeType === 'folder' && nodeId === targetFolderId) return

        // Check if pointer is in the center zone (drop INTO folder) or edge zone (reorder)
        if (isFolderCenterZone(`folder-${targetFolderId}`)) {
          // Center zone → insert as last child of folder
          const folder = findFolder(state.sidebarTree as SidebarNode[], targetFolderId)
          const index = folder ? folder.children.length : 0
          state.reorderSidebarNode(nodeId, nodeType, targetFolderId, index)
          state.expandFolder(targetFolderId)
        } else {
          // Edge zone → reorder next to the folder in its parent
          const overParentFolderId = (dropData.parentFolderId as string | null) ?? null
          const sidebarTree = state.sidebarTree as SidebarNode[]
          const parentChildren = overParentFolderId === null
            ? sidebarTree
            : findFolder(sidebarTree, overParentFolderId)?.children ?? sidebarTree

          const overIndex = parentChildren.findIndex(
            (child) => child.type === 'folder' && child.id === targetFolderId,
          )
          const insertAfter = isInsertAfter(`folder-${targetFolderId}`, 'vertical')
          let targetIndex = insertAfter ? overIndex + 1 : overIndex

          // Adjust for same-parent removal
          const dragParentId = (active.data.current as Record<string, unknown>).parentFolderId as string | null ?? null
          if (dragParentId === overParentFolderId) {
            const dragOrigIndex = parentChildren.findIndex((child) => {
              if (nodeType === 'workspace') return child.type === 'workspace' && child.workspaceId === nodeId
              return child.type === 'folder' && child.id === nodeId
            })
            if (dragOrigIndex !== -1 && dragOrigIndex < targetIndex) targetIndex--
          }

          state.reorderSidebarNode(nodeId, nodeType, overParentFolderId, targetIndex)
        }
      } else {
        // Dropped ON a workspace → insert before/after based on pointer position
        const overParentFolderId = (dropData.parentFolderId as string | null) ?? null
        const overWsId = dropData.workspaceId as string

        const sidebarTree = state.sidebarTree as SidebarNode[]
        const parentChildren = overParentFolderId === null
          ? sidebarTree
          : findFolder(sidebarTree, overParentFolderId)?.children ?? sidebarTree

        let overIndex = parentChildren.findIndex(
          (child) => child.type === 'workspace' && child.workspaceId === overWsId,
        )
        if (overIndex === -1) overIndex = parentChildren.length

        const insertAfter = isInsertAfter(`ws-${overWsId}`, 'vertical')
        let targetIndex = insertAfter ? overIndex + 1 : overIndex

        // Adjust for same-parent removal
        const dragParentId = (active.data.current as Record<string, unknown>).parentFolderId as string | null ?? null
        if (dragParentId === overParentFolderId) {
          const dragOrigIndex = parentChildren.findIndex((child) => {
            if (nodeType === 'workspace') return child.type === 'workspace' && child.workspaceId === nodeId
            return child.type === 'folder' && child.id === nodeId
          })
          if (dragOrigIndex !== -1 && dragOrigIndex < targetIndex) targetIndex--
        }

        state.reorderSidebarNode(nodeId, nodeType, overParentFolderId, targetIndex)
      }
      return
    }

    // ── Tab → Tab (reorder within same workspace) ──
    if (dragData.type === 'tab' && dropType === 'tab') {
      if (dragData.workspaceId === (dropData.workspaceId as string)) {
        const ws = state.workspaces.find((w) => w.id === dragData.workspaceId)
        if (!ws) return
        const fromIndex = ws.tabs.findIndex((t) => t.id === dragData.tabId)
        const overIndex = ws.tabs.findIndex((t) => t.id === (dropData.tabId as string))
        if (fromIndex === -1 || overIndex === -1) return

        const insertAfter = isInsertAfter(`tab-${dropData.tabId as string}`, 'horizontal')
        let targetIndex = insertAfter ? overIndex + 1 : overIndex
        if (fromIndex < targetIndex) targetIndex--
        if (fromIndex !== targetIndex) {
          state.reorderTabs(dragData.workspaceId, fromIndex, targetIndex)
        }
      }
      return
    }

    // ── Tab → Sidebar workspace (cross-workspace move) ──
    // Accept both 'sidebar-workspace-target' (separate droppable) and 'sidebar-workspace'
    // (sortable droppable). Both are registered on the same DOM element; pointerWithin
    // typically returns the sortable first since it's registered first.
    if (dragData.type === 'tab' && (dropType === 'sidebar-workspace-target' || dropType === 'sidebar-workspace')) {
      const targetWsId = dropData.workspaceId as string
      if (dragData.workspaceId !== targetWsId) {
        state.moveTabToWorkspace(dragData.workspaceId, dragData.tabId, targetWsId)
      }
      return
    }

    // ── Tab → Pane zone (merge tab into split) ──
    if (dragData.type === 'tab' && dropType === 'pane-zone') {
      // Compute split direction from pointer position relative to pane rect.
      const paneId = dropData.paneId as string
      const paneEl = document.querySelector(`[data-pane-drop-id="${paneId}"]`)
      let side: DropSide = 'right'
      if (paneEl && pointerPos) {
        const rect = paneEl.getBoundingClientRect()
        side = computeDropSide(pointerPos.x, pointerPos.y, rect)
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

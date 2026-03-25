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
import type { DragItemData } from '../types/dnd'
import type { SidebarNode } from '../types/workspace'

// React context to share activeDrag state without prop drilling
export const DragContext = createContext<DragItemData | null>(null)
export const useDragContext = () => useContext(DragContext)

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

    // ── group-tab → group-tab (cross-group tab move) ──
    // Intra-group reorder is handled by SortableContext in GroupTabBar.
    // Here we only handle cross-group moves.
    if (dragData.type === 'group-tab' && dropType === 'group-tab') {
      const srcGroupId = dragData.groupId
      const destGroupId = dropData.groupId as string
      if (srcGroupId === destGroupId) return // intra-group reorder handled by SortableContext
      state.moveTabToGroup(dragData.workspaceId, srcGroupId, dragData.tabId, destGroupId)
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

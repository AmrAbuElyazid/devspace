import { useState, useCallback, useRef, createContext, useContext } from 'react'
import {
  useSensors,
  useSensor,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  closestCenter,
  pointerWithin,
} from '@dnd-kit/core'
import { useWorkspaceStore } from '../store/workspace-store'
import { findFolder } from '../lib/sidebar-tree'
import type { DragItemData, DropSide } from '../types/dnd'
import type { SidebarNode } from '../types/workspace'

// React context to share activeDrag state without prop drilling
// This avoids re-rendering every PaneContainer/SplitLayout when drag state changes
export const DragContext = createContext<DragItemData | null>(null)
export const useDragContext = () => useContext(DragContext)

export function useDragAndDrop() {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null)
  const [dropSide, setDropSide] = useState<DropSide | null>(null)
  const dragInProgressRef = useRef(false)
  const suppressClickRef = useRef(false)
  const folderExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredFolderIdRef = useRef<string | null>(null)

  const store = useWorkspaceStore

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const { active, droppableContainers } = args
    const activeData = active.data.current as Record<string, unknown> | undefined

    if (activeData?.type === 'tab') {
      // For tab drags, prioritize: tab items > sidebar targets > pane zones
      const tabContainers = droppableContainers.filter((container) => {
        const data = container.data.current as Record<string, unknown> | undefined
        return data?.type === 'tab'
      })
      const tabCollisions = closestCenter({ ...args, droppableContainers: tabContainers })
      if (tabCollisions.length > 0) return tabCollisions

      const sidebarContainers = droppableContainers.filter((container) => {
        const data = container.data.current as Record<string, unknown> | undefined
        return data?.type === 'sidebar-workspace-target'
      })
      const sidebarCollisions = pointerWithin({ ...args, droppableContainers: sidebarContainers })
      if (sidebarCollisions.length > 0) return sidebarCollisions

      const paneContainers = droppableContainers.filter((container) => {
        const data = container.data.current as Record<string, unknown> | undefined
        return data?.type === 'pane-zone'
      })
      const paneCollisions = pointerWithin({ ...args, droppableContainers: paneContainers })
      if (paneCollisions.length > 0) return paneCollisions

      return []
    }

    if (activeData?.type === 'sidebar-workspace' || activeData?.type === 'sidebar-folder') {
      // For sidebar drags, only consider sidebar items
      const sidebarContainers = droppableContainers.filter((container) => {
        const data = container.data.current as Record<string, unknown> | undefined
        return data?.type === 'sidebar-workspace' || data?.type === 'sidebar-folder' || data?.type === 'sidebar-workspace-target'
      })
      const collisions = closestCenter({ ...args, droppableContainers: sidebarContainers })
      if (collisions.length > 0) return collisions
    }

    // Default fallback
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
    dragInProgressRef.current = true
    suppressClickRef.current = true
  }, [])

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      clearFolderExpandTimer()
      setDropSide(null)
      return
    }

    const overData = over.data.current as Record<string, unknown> | undefined
    if (!overData) return

    // Folder auto-expand
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

    // Pane zone side detection
    if (overData.type === 'pane-zone') {
      setDropSide((overData.side as DropSide) ?? null)
    } else {
      setDropSide(null)
    }
  }, [clearFolderExpandTimer])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveDrag(null)
    setDropSide(null)
    clearFolderExpandTimer()
    dragInProgressRef.current = false

    requestAnimationFrame(() => {
      suppressClickRef.current = false
    })

    if (!over) return

    const dragData = active.data.current as DragItemData
    const dropData = over.data.current as Record<string, unknown> | undefined
    if (!dragData || !dropData) return
    const dropType = dropData.type as string

    const state = store.getState()

    // === Sidebar item dropped on another sidebar item (reorder / cross-level move) ===
    const isSidebarDrag = dragData.type === 'sidebar-workspace' || dragData.type === 'sidebar-folder'
    const isSidebarDrop = dropType === 'sidebar-workspace' || dropType === 'sidebar-folder'

    if (isSidebarDrag && isSidebarDrop) {
      const nodeId = dragData.type === 'sidebar-workspace' ? dragData.workspaceId : dragData.folderId
      const nodeType = dragData.type === 'sidebar-workspace' ? 'workspace' : 'folder'

      if (dropType === 'sidebar-folder') {
        // Dropped ON a folder → insert as last child of that folder
        const targetFolderId = dropData.folderId as string
        // Don't drop a folder into itself
        if (nodeType === 'folder' && nodeId === targetFolderId) return
        const folder = findFolder(state.sidebarTree as SidebarNode[], targetFolderId)
        const index = folder ? folder.children.length : 0
        state.reorderSidebarNode(nodeId, nodeType, targetFolderId, index)
      } else {
        // Dropped ON a workspace → insert at the workspace's position in its parent
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

    // === Tab reorder within tab bar ===
    // Note: useSortable data uses { type: 'tab', ... }, so dropType is 'tab' not 'tab-sortable'
    if (dragData.type === 'tab' && dropType === 'tab') {
      const ws = state.workspaces.find((w: any) => w.id === dragData.workspaceId)
      if (!ws) return
      if (dragData.workspaceId === (dropData.workspaceId as string)) {
        const fromIndex = ws.tabs.findIndex((t: any) => t.id === dragData.tabId)
        const toIndex = ws.tabs.findIndex((t: any) => t.id === (dropData.tabId as string))
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          state.reorderTabs(dragData.workspaceId, fromIndex, toIndex)
        }
      }
      return
    }

    // === Tab dropped on sidebar workspace (cross-workspace move) ===
    if (dragData.type === 'tab' && dropType === 'sidebar-workspace-target') {
      const targetWsId = dropData.workspaceId as string
      if (dragData.workspaceId !== targetWsId) {
        state.moveTabToWorkspace(dragData.workspaceId, dragData.tabId, targetWsId)
      }
      return
    }

    // === Tab dropped on pane zone (merge into split) ===
    if (dragData.type === 'tab' && dropType === 'pane-zone') {
      state.mergeTabIntoSplit(
        dragData.workspaceId,
        dragData.tabId,
        dropData.workspaceId as string,
        dropData.tabId as string,
        dropData.paneId as string,
        dropData.side as 'left' | 'right' | 'top' | 'bottom',
      )
      return
    }
  }, [clearFolderExpandTimer])

  const onDragCancel = useCallback(() => {
    setActiveDrag(null)
    setDropSide(null)
    clearFolderExpandTimer()
    dragInProgressRef.current = false
    suppressClickRef.current = false
  }, [clearFolderExpandTimer])

  return {
    sensors,
    collisionDetection,
    activeDrag,
    dropSide,
    dragInProgressRef,
    suppressClickRef,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}

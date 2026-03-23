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
  rectIntersection,
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
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    const closestCollisions = closestCenter(args)
    if (closestCollisions.length > 0) return closestCollisions
    return rectIntersection(args)
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

    // === Sidebar reorder ===
    if (
      (dragData.type === 'sidebar-workspace' || dragData.type === 'sidebar-folder') &&
      dropType === 'sidebar-sortable'
    ) {
      const nodeId = dragData.type === 'sidebar-workspace' ? dragData.workspaceId : dragData.folderId
      const nodeType = dragData.type === 'sidebar-workspace' ? 'workspace' : 'folder'
      state.reorderSidebarNode(
        nodeId,
        nodeType,
        dropData.parentFolderId as string | null,
        dropData.index as number,
      )
      return
    }

    // === Drop into folder ===
    if (
      (dragData.type === 'sidebar-workspace' || dragData.type === 'sidebar-folder') &&
      dropType === 'sidebar-folder'
    ) {
      const nodeId = dragData.type === 'sidebar-workspace' ? dragData.workspaceId : dragData.folderId
      const nodeType = dragData.type === 'sidebar-workspace' ? 'workspace' : 'folder'
      const targetFolderId = dropData.folderId as string
      const folder = findFolder(state.sidebarTree as SidebarNode[], targetFolderId)
      const index = folder ? folder.children.length : 0
      state.reorderSidebarNode(nodeId, nodeType, targetFolderId, index)
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

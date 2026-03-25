import { useState, useCallback, useRef, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Settings, ChevronDown, ChevronRight, ChevronLeft, FolderClosed, Search, X, Star } from 'lucide-react'
import { useWorkspaceStore, collectGroupIds } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import { AlertDialog } from './ui/alert-dialog'
import { InlineRenameInput } from './ui/InlineRenameInput'
import { useInsertionIndicator } from '../hooks/useInsertionIndicator'
import type { ContextMenuItem } from '../../shared/types'
import type { SidebarNode, Workspace, Pane, PaneGroup, TerminalConfig, EditorConfig } from '../types/workspace'
import { useDragContext } from '../hooks/useDragAndDrop'

// ---------------------------------------------------------------------------
// Utility: format relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Utility: compute workspace metadata string
// ---------------------------------------------------------------------------

function getWorkspaceMetadata(ws: Workspace, panes: Record<string, Pane>, paneGroups: Record<string, PaneGroup>): string {
  const groupIds = collectGroupIds(ws.root)
  let paneCount = 0
  let primaryDir = ''
  for (const gid of groupIds) {
    const group = paneGroups[gid]
    if (!group) continue
    for (const tab of group.tabs) {
      const pane = panes[tab.paneId]
      if (!pane || pane.type === 'empty') continue
      paneCount++
      if (!primaryDir && pane.type === 'terminal') {
        const cwd = (pane.config as TerminalConfig).cwd
        if (cwd) primaryDir = cwd.replace(/^\/Users\/[^/]+/, '~')
      }
      if (!primaryDir && pane.type === 'editor') {
        const folder = (pane.config as EditorConfig).folderPath
        if (folder) primaryDir = folder.replace(/^\/Users\/[^/]+/, '~')
      }
    }
  }
  const parts: string[] = []
  if (paneCount > 0) parts.push(`${paneCount} pane${paneCount > 1 ? 's' : ''}`)
  if (primaryDir) parts.push(primaryDir)
  parts.push(formatRelativeTime(ws.lastActiveAt))
  return parts.join(' \u00b7 ')
}

// ---------------------------------------------------------------------------
// SortableWorkspaceItem
// ---------------------------------------------------------------------------

function SortableWorkspaceItem({
  workspaceId,
  parentFolderId,
  depth,
  isActive,
  isEditing,
  name,
  metadata,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onContextMenu,
}: {
  workspaceId: string
  parentFolderId: string | null
  depth: number
  isActive: boolean
  isEditing: boolean
  name: string
  metadata: string
  onSelect: () => void
  onStartEditing: () => void
  onRename: (name: string) => void
  onStopEditing: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const { activeDrag } = useDragContext()
  const mergedRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    isDragging,
    isOver,
  } = useSortable({
    id: `ws-${workspaceId}`,
    data: { type: 'sidebar-workspace' as const, workspaceId, parentFolderId, visible: true },
  })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      mergedRef.current = el
      setSortableRef(el)
    },
    [setSortableRef],
  )

  // Insertion line indicator — items stay in place, line shows where drop will go
  const isSidebarDrag = activeDrag?.type === 'sidebar-workspace' || activeDrag?.type === 'sidebar-folder'
  const insertPosition = useInsertionIndicator(isOver && !isDragging && isSidebarDrag, false, mergedRef, 'vertical')

  const isTabDropTarget = isOver && !isDragging && activeDrag?.type === 'group-tab'
    && activeDrag.workspaceId !== workspaceId

  const style = {
    paddingLeft: depth * 16,
    opacity: isDragging ? 0.4 : undefined,
  }

  const insertClass = insertPosition === 'before' ? 'sidebar-insert-before' : insertPosition === 'after' ? 'sidebar-insert-after' : ''

  return (
    <div
      ref={setRef}
      style={style}
      data-sortable-id={`ws-${workspaceId}`}
      className={`ws-item no-drag ${isActive ? 'ws-item-active' : ''} ${insertClass} ${isTabDropTarget ? 'ws-item-tab-drop' : ''}`}
      onClick={() => { if (!isEditing) onSelect() }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <div className="ws-item-content">
        <div className="ws-item-row">
          <span
            className="ws-dot"
            style={{
              background: isActive ? 'var(--accent)' : 'var(--foreground-faint)',
            }}
          />
          {isEditing ? (
            <InlineRenameInput
              initialValue={name}
              onCommit={(newName) => {
                onRename(newName)
                onStopEditing()
              }}
              onCancel={onStopEditing}
              className="text-[13px]"
            />
          ) : (
            <span className="flex-1 truncate">{name}</span>
          )}
        </div>
        {!isEditing && metadata && <div className="ws-meta">{metadata}</div>}
      </div>
    </div>
  )
}

function PinnedWorkspaceItem({
  workspaceId,
  isActive,
  name,
  onSelect,
  onContextMenu,
}: {
  workspaceId: string
  isActive: boolean
  name: string
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const { activeDrag } = useDragContext()
  const { setNodeRef, isOver } = useDroppable({
    id: `pinned-ws-${workspaceId}`,
    data: { type: 'sidebar-workspace' as const, workspaceId, parentFolderId: null, visible: true },
  })

  const isTabDropTarget = isOver && activeDrag?.type === 'group-tab' && activeDrag.workspaceId !== workspaceId

  return (
    <div
      ref={setNodeRef}
      className={`ws-item ${isActive ? 'ws-item-active' : ''} ${isTabDropTarget ? 'ws-item-tab-drop' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <Star size={10} className="pinned-star" />
      <span
        className="ws-dot"
        style={{
          background: isActive ? 'var(--accent)' : 'var(--foreground-faint)',
        }}
      />
      <span className="flex-1 truncate" style={{ fontSize: 13 }}>{name}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SortableFolderItem
// ---------------------------------------------------------------------------

function SortableFolderItem({
  folder,
  parentFolderId,
  depth,
  isEditing,
  editingId,
  editingType,
  filteredWorkspaceIds,
  onToggle,
  onStartEditingFolder,
  onStartEditingWorkspace,
  onRenameFolder,
  onRenameWorkspace,
  onStopEditing,
  onContextMenuFolder,
  onContextMenuWorkspace,
  onSelectWorkspace,
  activeWorkspaceId,
  deleteTarget,
  setDeleteTarget,
}: {
  folder: SidebarNode & { type: 'folder' }
  parentFolderId: string | null
  depth: number
  isEditing: boolean
  editingId: string | null
  editingType: 'workspace' | 'folder' | null
  filteredWorkspaceIds: Set<string> | null
  onToggle: () => void
  onStartEditingFolder: (id: string) => void
  onStartEditingWorkspace: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onStopEditing: () => void
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void
  onSelectWorkspace: (id: string) => void
  activeWorkspaceId: string
  deleteTarget: string | null
  setDeleteTarget: (id: string | null) => void
}): JSX.Element {
  const folderRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver,
  } = useSortable({
    id: `folder-${folder.id}`,
    data: { type: 'sidebar-folder' as const, folderId: folder.id, parentFolderId, visible: true },
  })

  const setFolderRef = useCallback(
    (el: HTMLDivElement | null) => {
      folderRef.current = el
      setNodeRef(el)
    },
    [setNodeRef],
  )

  // Folder uses edge zones (0.25 threshold): edges show insertion line, center shows folder highlight
  const { activeDrag: activeDragCtx } = useDragContext()
  const isSidebarDrag = activeDragCtx?.type === 'sidebar-workspace' || activeDragCtx?.type === 'sidebar-folder'
  const insertPosition = useInsertionIndicator(isOver && !isDragging && isSidebarDrag, false, folderRef, 'vertical', 0.25)

  // Show folder highlight only when pointer is in center zone (insertPosition === null means center)
  const showDragOver = isOver && !isDragging && isSidebarDrag && insertPosition === null
  const insertClass = insertPosition === 'before' ? 'sidebar-insert-before' : insertPosition === 'after' ? 'sidebar-insert-after' : ''

  // When filtering, force folders expanded
  const isExpanded = filteredWorkspaceIds ? true : !folder.collapsed

  return (
    <div style={{ opacity: isDragging ? 0.4 : undefined }}>
      <div
        ref={setFolderRef}
        data-sortable-id={`folder-${folder.id}`}
        className={`folder-header no-drag ${showDragOver ? 'sidebar-item-drag-over-folder' : ''} ${insertClass}`}
        onClick={onToggle}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          paddingLeft: depth * 16 + 10,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.03em',
          color: 'var(--foreground-faint)',
          cursor: 'pointer',
          userSelect: 'none',
          marginTop: 4,
        }}
        {...attributes}
        {...listeners}
      >
        {!isExpanded ? (
          <ChevronRight size={10} />
        ) : (
          <ChevronDown size={10} />
        )}
        <FolderClosed size={12} style={{ opacity: 0.6 }} />
        {isEditing ? (
          <InlineRenameInput
            initialValue={folder.name}
            onCommit={(name) => {
              onRenameFolder(folder.id, name)
              onStopEditing()
            }}
            onCancel={onStopEditing}
            className="text-[12px]"
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}
      </div>

      {isExpanded && (
        <SidebarTreeLevel
          nodes={folder.children}
          parentFolderId={folder.id}
          depth={depth + 1}
          editingId={editingId}
          editingType={editingType}
          filteredWorkspaceIds={filteredWorkspaceIds}
          onStartEditingFolder={onStartEditingFolder}
          onStartEditingWorkspace={onStartEditingWorkspace}
          onRenameFolder={onRenameFolder}
          onRenameWorkspace={onRenameWorkspace}
          onStopEditing={onStopEditing}
          onContextMenuFolder={onContextMenuFolder}
          onContextMenuWorkspace={onContextMenuWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SidebarTreeLevel — recursive level renderer
// ---------------------------------------------------------------------------

function SidebarTreeLevel({
  nodes,
  parentFolderId,
  depth,
  editingId,
  editingType,
  filteredWorkspaceIds,
  onStartEditingFolder,
  onStartEditingWorkspace,
  onRenameFolder,
  onRenameWorkspace,
  onStopEditing,
  onContextMenuFolder,
  onContextMenuWorkspace,
  onSelectWorkspace,
  activeWorkspaceId,
  deleteTarget,
  setDeleteTarget,
}: {
  nodes: SidebarNode[]
  parentFolderId: string | null
  depth: number
  editingId: string | null
  editingType: 'workspace' | 'folder' | null
  filteredWorkspaceIds: Set<string> | null
  onStartEditingFolder: (id: string) => void
  onStartEditingWorkspace: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onStopEditing: () => void
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void
  onSelectWorkspace: (id: string) => void
  activeWorkspaceId: string
  deleteTarget: string | null
  setDeleteTarget: (id: string | null) => void
}): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const panes = useWorkspaceStore((s) => s.panes)
  const paneGroups = useWorkspaceStore((s) => s.paneGroups)
  const toggleFolderCollapsed = useWorkspaceStore((s) => s.toggleFolderCollapsed)

  const sortableIds = nodes.map((n) =>
    n.type === 'workspace' ? `ws-${n.workspaceId}` : `folder-${n.id}`,
  )

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => {
        if (node.type === 'workspace') {
          // Skip if filtered out
          if (filteredWorkspaceIds && !filteredWorkspaceIds.has(node.workspaceId)) return null
          const ws = workspaces.find((w) => w.id === node.workspaceId)
          if (!ws) return null
          const metadata = getWorkspaceMetadata(ws, panes, paneGroups)
          return (
            <SortableWorkspaceItem
              key={`ws-${ws.id}`}
              workspaceId={ws.id}
              parentFolderId={parentFolderId}
              depth={depth}
              isActive={ws.id === activeWorkspaceId}
              isEditing={editingId === ws.id && editingType === 'workspace'}
              name={ws.name}
              metadata={metadata}
              onSelect={() => onSelectWorkspace(ws.id)}
              onStartEditing={() => onStartEditingWorkspace(ws.id)}
              onRename={(name) => onRenameWorkspace(ws.id, name)}
              onStopEditing={onStopEditing}
              onContextMenu={(e) => onContextMenuWorkspace(e, ws.id)}
            />
          )
        }

        // folder node
        return (
          <SortableFolderItem
            key={`folder-${node.id}`}
            folder={node}
            parentFolderId={parentFolderId}
            depth={depth}
            isEditing={editingId === node.id && editingType === 'folder'}
            editingId={editingId}
            editingType={editingType}
            filteredWorkspaceIds={filteredWorkspaceIds}
            onToggle={() => toggleFolderCollapsed(node.id)}
            onStartEditingFolder={onStartEditingFolder}
            onStartEditingWorkspace={onStartEditingWorkspace}
            onRenameFolder={onRenameFolder}
            onRenameWorkspace={onRenameWorkspace}
            onStopEditing={onStopEditing}
            onContextMenuFolder={onContextMenuFolder}
            onContextMenuWorkspace={onContextMenuWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            activeWorkspaceId={activeWorkspaceId}
            deleteTarget={deleteTarget}
            setDeleteTarget={setDeleteTarget}
          />
        )
      })}
    </SortableContext>
  )
}

// ---------------------------------------------------------------------------
// Main Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar(): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const sidebarTree = useWorkspaceStore((s) => s.sidebarTree)
  const addFolder = useWorkspaceStore((s) => s.addFolder)
  const removeFolder = useWorkspaceStore((s) => s.removeFolder)
  const renameFolder = useWorkspaceStore((s) => s.renameFolder)
  const toggleFolderCollapsed = useWorkspaceStore((s) => s.toggleFolderCollapsed)
  const togglePinWorkspace = useWorkspaceStore((s) => s.togglePinWorkspace)
  const panes = useWorkspaceStore((s) => s.panes)
  const paneGroups = useWorkspaceStore((s) => s.paneGroups)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth)
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)

  const { activeDrag } = useDragContext()

  const pinnedWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.pinned),
    [workspaces],
  )

  const [searchQuery, setSearchQuery] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<'workspace' | 'folder' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const filteredWorkspaceIds = useMemo(() => {
    if (!searchQuery.trim()) return null // null = show all
    const q = searchQuery.toLowerCase()
    return new Set(workspaces.filter((ws) => ws.name.toLowerCase().includes(q)).map((ws) => ws.id))
  }, [searchQuery, workspaces])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    setIsResizing(true)

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      setSidebarWidth(resizeRef.current.startWidth + delta)
    }
    const onMouseUp = () => {
      setIsResizing(false)
      resizeRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sidebarWidth, setSidebarWidth])

  const startEditingWorkspace = useCallback((id: string) => {
    setEditingId(id)
    setEditingType('workspace')
  }, [])

  const startEditingFolder = useCallback((id: string) => {
    setEditingId(id)
    setEditingType('folder')
  }, [])

  const stopEditing = useCallback(() => {
    setEditingId(null)
    setEditingType(null)
  }, [])

  const handleWorkspaceContextMenu = useCallback(async (e: React.MouseEvent, workspaceId: string) => {
    e.preventDefault()
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return

    const items: ContextMenuItem[] = [
      { id: 'rename', label: 'Rename' },
      { id: 'pin', label: ws.pinned ? 'Unpin' : 'Pin' },
      { id: 'new-folder', label: 'New Folder...' },
      ...(workspaces.length > 1 ? [{ id: 'delete', label: 'Delete', destructive: true }] : []),
    ]

    const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY })
    if (!result) return

    if (result === 'rename') startEditingWorkspace(workspaceId)
    else if (result === 'pin') togglePinWorkspace(workspaceId)
    else if (result === 'new-folder') addFolder('New Folder')
    else if (result === 'delete') setDeleteTarget(workspaceId)
  }, [workspaces, startEditingWorkspace, addFolder, togglePinWorkspace])

  const handleFolderContextMenu = useCallback(async (e: React.MouseEvent, folderId: string) => {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      { id: 'rename', label: 'Rename Folder' },
      { id: 'add-workspace', label: 'Add Workspace' },
      { id: 'add-subfolder', label: 'Add Sub-folder' },
      { id: 'delete', label: 'Delete Folder', destructive: true },
    ]

    const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY })
    if (result === 'rename') startEditingFolder(folderId)
    else if (result === 'add-workspace') addWorkspace()
    else if (result === 'add-subfolder') addFolder('New Folder', folderId)
    else if (result === 'delete') removeFolder(folderId)
  }, [startEditingFolder, addWorkspace, addFolder, removeFolder])

  return (
    <div
      className={`sidebar ${!sidebarOpen ? 'sidebar-collapsed' : ''} ${isResizing ? 'sidebar-resizing' : ''}`}
      style={sidebarOpen ? { width: sidebarWidth, minWidth: sidebarWidth } : undefined}
    >
      {/* Header — drag region with traffic light space + branding */}
      <div className="sidebar-header drag-region">
        <span className="sidebar-label no-drag">DevSpace</span>
        <button
          className="sidebar-collapse-btn no-drag"
          onClick={toggleSidebar}
          title="Toggle sidebar (⌘B)"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Search bar */}
      <div className="sidebar-search">
        <Search size={12} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder="Search workspaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery('') }}
          className="sidebar-search-input no-drag"
        />
        {searchQuery && (
          <button className="sidebar-search-clear no-drag" onClick={() => setSearchQuery('')}>
            <X size={10} />
          </button>
        )}
      </div>

      {/* Pinned section */}
      {pinnedWorkspaces.length > 0 && (
        <>
          <div className="sidebar-section-header">
            <span className="sidebar-label">Pinned</span>
          </div>
          <div className="sidebar-pinned-list">
            {pinnedWorkspaces.map((ws) => (
              <PinnedWorkspaceItem
                key={`pinned-${ws.id}`}
                workspaceId={ws.id}
                isActive={ws.id === activeWorkspaceId}
                name={ws.name}
                onSelect={() => setActiveWorkspace(ws.id)}
                onContextMenu={(e) => handleWorkspaceContextMenu(e, ws.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Section label + add button */}
      <div className="sidebar-section-header">
        <span className="sidebar-label">Workspaces</span>
        <Tooltip content="New workspace" shortcut="⌘N">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => addWorkspace()}
            className="no-drag"
          >
            <Plus size={13} />
          </Button>
        </Tooltip>
      </div>

      {/* Sidebar tree with DnD */}
      <ScrollArea className="ws-list">
        <SidebarTreeLevel
          nodes={sidebarTree}
          parentFolderId={null}
          depth={0}
          editingId={editingId}
          editingType={editingType}
          filteredWorkspaceIds={filteredWorkspaceIds}
          onStartEditingFolder={startEditingFolder}
          onStartEditingWorkspace={startEditingWorkspace}
          onRenameFolder={(id, name) => renameFolder(id, name)}
          onRenameWorkspace={(id, name) => renameWorkspace(id, name)}
          onStopEditing={stopEditing}
          onContextMenuFolder={handleFolderContextMenu}
          onContextMenuWorkspace={handleWorkspaceContextMenu}
          onSelectWorkspace={(id) => setActiveWorkspace(id)}
          activeWorkspaceId={activeWorkspaceId}
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
        />
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete workspace?"
        description="This workspace and all its tabs will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteTarget) removeWorkspace(deleteTarget)
        }}
        variant="destructive"
      />

      {/* Footer — gear icon */}
      <div
        className="sidebar-footer"
        style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={() => useSettingsStore.getState().toggleSettings()}
          className="no-drag flex items-center justify-center rounded-md p-1 transition-colors"
          style={{ color: 'var(--foreground-faint)' }}
          onMouseEnter={(e) => { (e.currentTarget.style.color = 'var(--foreground-muted)') }}
          onMouseLeave={(e) => { (e.currentTarget.style.color = 'var(--foreground-faint)') }}
          title="Settings (⌘,)"
        >
          <Settings size={15} />
        </button>
      </div>

      {sidebarOpen && (
        <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      )}
    </div>
  )
}

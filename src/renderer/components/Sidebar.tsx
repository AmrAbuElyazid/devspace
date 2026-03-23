import { useState, useCallback, useRef } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Settings, ChevronDown, ChevronRight, FolderClosed } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import { AlertDialog } from './ui/alert-dialog'
import { InlineRenameInput } from './ui/InlineRenameInput'
import type { ContextMenuItem } from '../../shared/types'
import type { SidebarNode } from '../types/workspace'
import { useDragContext } from '../hooks/useDragAndDrop'

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
  onSelect: () => void
  onStartEditing: () => void
  onRename: (name: string) => void
  onStopEditing: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const activeDrag = useDragContext()
  const mergedRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `ws-${workspaceId}`,
    data: { type: 'sidebar-workspace' as const, workspaceId, parentFolderId },
  })

  const { setNodeRef: setDropRef, isOver: isTabOver } = useDroppable({
    id: `ws-drop-${workspaceId}`,
    data: { type: 'sidebar-workspace-target', workspaceId },
    disabled: activeDrag?.type !== 'tab',
  })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      mergedRef.current = el
      setSortableRef(el)
      setDropRef(el)
    },
    [setSortableRef, setDropRef],
  )

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: depth * 16,
    opacity: isDragging ? 0.4 : undefined,
  }

  // Only show drop target highlight when dragging a tab from a DIFFERENT workspace
  const showDropTarget = isTabOver && activeDrag?.type === 'tab' && activeDrag.workspaceId !== workspaceId

  return (
    <div
      ref={setRef}
      style={style}
      className={`ws-item no-drag ${isActive ? 'ws-item-active' : ''} ${showDropTarget ? 'sidebar-workspace-drop-target' : ''}`}
      onClick={() => { if (!isEditing) onSelect() }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isActive ? 'var(--accent)' : 'var(--foreground-faint)',
          flexShrink: 0,
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `folder-${folder.id}`,
    data: { type: 'sidebar-folder' as const, folderId: folder.id, parentFolderId },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const showDragOver = isOver && !isDragging

  return (
    <div style={style}>
      <div
        ref={setNodeRef}
        className={`folder-header no-drag ${showDragOver ? 'sidebar-item-drag-over-folder' : ''}`}
        onClick={onToggle}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{
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
        {folder.collapsed ? (
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

      {!folder.collapsed && (
        <SidebarTreeLevel
          nodes={folder.children}
          parentFolderId={folder.id}
          depth={depth + 1}
          editingId={editingId}
          editingType={editingType}
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
  const toggleFolderCollapsed = useWorkspaceStore((s) => s.toggleFolderCollapsed)

  const sortableIds = nodes.map((n) =>
    n.type === 'workspace' ? `ws-${n.workspaceId}` : `folder-${n.id}`,
  )

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => {
        if (node.type === 'workspace') {
          const ws = workspaces.find((w) => w.id === node.workspaceId)
          if (!ws) return null
          return (
            <SortableWorkspaceItem
              key={`ws-${ws.id}`}
              workspaceId={ws.id}
              parentFolderId={parentFolderId}
              depth={depth}
              isActive={ws.id === activeWorkspaceId}
              isEditing={editingId === ws.id && editingType === 'workspace'}
              name={ws.name}
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
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)

  const activeDrag = useDragContext()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<'workspace' | 'folder' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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
    const items: ContextMenuItem[] = [
      { id: 'rename', label: 'Rename' },
      { id: 'new-folder', label: 'New Folder...' },
      ...(workspaces.length > 1 ? [{ id: 'delete', label: 'Delete', destructive: true }] : []),
    ]

    const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY })
    if (!result) return

    if (result === 'rename') startEditingWorkspace(workspaceId)
    else if (result === 'new-folder') addFolder('New Folder')
    else if (result === 'delete') setDeleteTarget(workspaceId)
  }, [workspaces, startEditingWorkspace, addFolder])

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
    <div className={`sidebar ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
      {/* Header — drag region with traffic light space + branding */}
      <div className="sidebar-header drag-region">
        <span className="sidebar-label no-drag">DevSpace</span>
      </div>

      {/* Section label + add button */}
      <div className="flex items-center justify-between px-4 pb-1 shrink-0">
        <span className="sidebar-label" style={{ fontSize: 10 }}>Workspaces</span>
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
    </div>
  )
}

import { useState, useCallback } from 'react'
import { Plus, Settings, ChevronDown, ChevronRight, FolderClosed } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import { AlertDialog } from './ui/alert-dialog'
import { InlineRenameInput } from './ui/InlineRenameInput'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, MenuItem, MenuSeparator } from './ui/menu'

export default function Sidebar(): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const folders = useWorkspaceStore((s) => s.folders)
  const addFolder = useWorkspaceStore((s) => s.addFolder)
  const removeFolder = useWorkspaceStore((s) => s.removeFolder)
  const renameFolder = useWorkspaceStore((s) => s.renameFolder)
  const toggleFolderCollapsed = useWorkspaceStore((s) => s.toggleFolderCollapsed)
  const moveWorkspaceToFolder = useWorkspaceStore((s) => s.moveWorkspaceToFolder)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)

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

  // Group workspaces by folder
  const ungroupedWorkspaces = workspaces.filter((ws) => ws.folderId === null)

  const renderWorkspaceItem = (ws: (typeof workspaces)[0], indented = false) => {
    const isActive = ws.id === activeWorkspaceId
    const isEditing = editingId === ws.id && editingType === 'workspace'

    return (
      <ContextMenu key={ws.id}>
        <ContextMenuTrigger>
          <div
            className={`ws-item no-drag ${isActive ? 'ws-item-active' : ''}`}
            style={indented ? { paddingLeft: 28 } : undefined}
            onClick={() => { if (!isEditing) setActiveWorkspace(ws.id) }}
            onDoubleClick={() => startEditingWorkspace(ws.id)}
          >
            {/* Amber dot */}
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
                initialValue={ws.name}
                onCommit={(name) => {
                  renameWorkspace(ws.id, name)
                  stopEditing()
                }}
                onCancel={stopEditing}
                className="text-[13px]"
              />
            ) : (
              <span className="flex-1 truncate">{ws.name}</span>
            )}
          </div>
        </ContextMenuTrigger>

        {/* Context menu */}
        <ContextMenuContent side="bottom" align="start">
          <MenuItem onClick={() => startEditingWorkspace(ws.id)}>
            Rename
          </MenuItem>
          <MenuSeparator />
          {/* Move to Folder options */}
          {folders.map((folder) => (
            <MenuItem
              key={folder.id}
              onClick={() => moveWorkspaceToFolder(ws.id, folder.id)}
            >
              → {folder.name}
            </MenuItem>
          ))}
          <MenuItem
            onClick={() => {
              const fid = addFolder('New Folder')
              moveWorkspaceToFolder(ws.id, fid)
            }}
          >
            New Folder...
          </MenuItem>
          {ws.folderId !== null && (
            <MenuItem onClick={() => moveWorkspaceToFolder(ws.id, null)}>
              No Folder
            </MenuItem>
          )}
          <MenuSeparator />
          {workspaces.length > 1 && (
            <MenuItem onClick={() => setDeleteTarget(ws.id)} destructive>
              Delete
            </MenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

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

      {/* Workspace list with folders */}
      <ScrollArea className="ws-list">
        {/* Folders first */}
        {folders.map((folder) => {
          const folderWorkspaces = workspaces.filter((ws) => ws.folderId === folder.id)
          const isFolderEditing = editingId === folder.id && editingType === 'folder'

          return (
            <div key={folder.id}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <div
                  className="folder-header no-drag"
                  onClick={() => toggleFolderCollapsed(folder.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.03em',
                    color: 'var(--foreground-faint)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    marginTop: 4,
                  }}
                  >
                    {folder.collapsed ? (
                      <ChevronRight size={10} />
                    ) : (
                      <ChevronDown size={10} />
                    )}
                    <FolderClosed size={12} style={{ opacity: 0.6 }} />
                    {isFolderEditing ? (
                      <InlineRenameInput
                        initialValue={folder.name}
                        onCommit={(name) => {
                          renameFolder(folder.id, name)
                          stopEditing()
                        }}
                        onCancel={stopEditing}
                        className="text-[12px]"
                      />
                    ) : (
                      <span className="flex-1 truncate">{folder.name}</span>
                    )}
                  </div>
                </ContextMenuTrigger>

                {/* Folder context menu */}
                <ContextMenuContent side="bottom" align="start">
                  <MenuItem onClick={() => startEditingFolder(folder.id)}>
                    Rename Folder
                  </MenuItem>
                  <MenuItem onClick={() => removeFolder(folder.id)} destructive>
                    Delete Folder
                  </MenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Workspaces inside this folder */}
              {!folder.collapsed && folderWorkspaces.map((ws) => renderWorkspaceItem(ws, true))}
            </div>
          )
        })}

        {/* Separator between folders and ungrouped */}
        {folders.length > 0 && ungroupedWorkspaces.length > 0 && (
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 10px' }} />
        )}

        {/* Ungrouped workspaces */}
        {ungroupedWorkspaces.map((ws) => renderWorkspaceItem(ws))}
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

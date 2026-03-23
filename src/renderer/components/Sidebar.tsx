import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, Sun, Monitor, Moon } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { useTheme } from '../hooks/useTheme'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import { AlertDialog } from './ui/alert-dialog'

interface EditingState {
  id: string
  value: string
}

export default function Sidebar(): React.JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)
  const { theme, setTheme } = useTheme()

  const [editing, setEditing] = useState<EditingState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitRename = useCallback(() => {
    if (!editing) return
    const trimmed = editing.value.trim()
    if (trimmed && trimmed !== workspaces.find((w) => w.id === editing.id)?.name) {
      renameWorkspace(editing.id, trimmed)
    }
    setEditing(null)
  }, [editing, workspaces, renameWorkspace])

  const themeOptions = [
    { value: 'light' as const, icon: Sun, title: 'Light' },
    { value: 'system' as const, icon: Monitor, title: 'System' },
    { value: 'dark' as const, icon: Moon, title: 'Dark' },
  ] as const

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

      {/* Workspace list */}
      <ScrollArea className="ws-list">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          const isEditing = editing?.id === ws.id

          return (
            <div
              key={ws.id}
              className={`ws-item no-drag ${isActive ? 'ws-item-active' : ''}`}
              onClick={() => { if (!isEditing) setActiveWorkspace(ws.id) }}
              onDoubleClick={() => setEditing({ id: ws.id, value: ws.name })}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[13px] outline-none"
                  style={{ color: 'var(--foreground)' }}
                  value={editing!.value}
                  onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{ws.name}</span>
                  {workspaces.length > 1 && (
                    <Tooltip content="Delete workspace">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ws-delete"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(ws.id) }}
                      >
                        <X size={12} />
                      </Button>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          )
        })}
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

      {/* Footer — theme toggle */}
      <div className="sidebar-footer">
        <div className="theme-pill-group">
          {themeOptions.map((opt) => {
            const Icon = opt.icon
            const isActive = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`no-drag theme-pill ${isActive ? 'theme-pill-active' : ''}`}
                title={opt.title}
              >
                <Icon size={13} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

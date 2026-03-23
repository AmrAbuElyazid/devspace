import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, Sun, Monitor, Moon } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { useTheme } from '../hooks/useTheme'

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
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus and select all when editing starts
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

  const cancelRename = useCallback(() => {
    setEditing(null)
  }, [])

  const handleAddWorkspace = useCallback(() => {
    addWorkspace()
  }, [addWorkspace])

  const themeOptions = [
    { value: 'light' as const, icon: Sun, title: 'Light' },
    { value: 'system' as const, icon: Monitor, title: 'System' },
    { value: 'dark' as const, icon: Moon, title: 'Dark' },
  ]

  return (
    <div
      className="shrink-0 flex flex-col overflow-hidden sidebar-transition"
      style={{
        width: sidebarOpen ? 'var(--sidebar-width)' : 0,
        minWidth: sidebarOpen ? 'var(--sidebar-width)' : 0,
        opacity: sidebarOpen ? 1 : 0,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Drag region extension — lets user drag from sidebar top area */}
      <div className="drag-region shrink-0" style={{ height: 18 }} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span
          className="text-[10px] font-semibold uppercase select-none"
          style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}
        >
          Workspaces
        </span>
        <button
          onClick={handleAddWorkspace}
          className="no-drag sidebar-btn flex items-center justify-center rounded-md p-1"
          style={{ color: 'var(--muted-foreground)' }}
          title="Add workspace"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto px-2 py-1" style={{ minHeight: 0 }}>
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          const isEditing = editing?.id === ws.id

          return (
            <div
              key={ws.id}
              className={cn(
                'group no-drag sidebar-item flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-[13px] select-none',
                isActive && 'sidebar-item-active font-medium',
              )}
              style={{
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
              onClick={() => {
                if (!isEditing) setActiveWorkspace(ws.id)
              }}
              onDoubleClick={() => {
                setEditing({ id: ws.id, value: ws.name })
              }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[13px] outline-none border rounded-md px-1.5 py-0"
                  style={{
                    color: 'var(--foreground)',
                    borderColor: 'var(--primary)',
                  }}
                  value={editing!.value}
                  onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{ws.name}</span>
                  {workspaces.length > 1 && (
                    <button
                      className="ws-delete-btn opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-md p-0.5"
                      style={{ color: 'var(--muted-foreground)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeWorkspace(ws.id)
                      }}
                      title="Delete workspace"
                    >
                      <X size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer — Theme toggle + shortcut hint */}
      <div
        className="shrink-0 px-3 py-2.5 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {/* Theme toggle — pill group */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {themeOptions.map((opt) => {
            const Icon = opt.icon
            const isActive = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  'no-drag theme-toggle-btn flex-1 flex items-center justify-center rounded-md p-1.5',
                  isActive && 'theme-toggle-active',
                )}
                style={{
                  backgroundColor: isActive ? 'var(--card)' : undefined,
                  color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                }}
                title={opt.title}
              >
                <Icon size={13} />
              </button>
            )
          })}
        </div>

        {/* Shortcut hint */}
        <span
          className="text-[10px] select-none"
          style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}
        >
          {window.api?.platform === 'darwin' ? '⌘' : 'Ctrl+'}B to toggle
        </span>
      </div>
    </div>
  )
}

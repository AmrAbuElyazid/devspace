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
      className="shrink-0 flex flex-col overflow-hidden border-r sidebar-transition"
      style={{
        width: sidebarOpen ? 'var(--sidebar-width)' : 0,
        minWidth: sidebarOpen ? 'var(--sidebar-width)' : 0,
        opacity: sidebarOpen ? 1 : 0,
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Drag region extension — lets user drag from sidebar top area */}
      <div className="drag-region shrink-0" style={{ height: 18 }} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider select-none"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Workspaces
        </span>
        <button
          onClick={handleAddWorkspace}
          className="no-drag flex items-center justify-center rounded p-0.5 transition-colors duration-150"
          style={{ color: 'var(--muted-foreground)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--foreground)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--muted-foreground)'
          }}
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
                'group no-drag flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm select-none tab-transition',
                isActive && 'font-medium',
              )}
              style={{
                backgroundColor: isActive ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : undefined,
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
              onClick={() => {
                if (!isEditing) setActiveWorkspace(ws.id)
              }}
              onDoubleClick={() => {
                setEditing({ id: ws.id, value: ws.name })
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--accent)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-sm outline-none border rounded px-1 py-0"
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
                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded p-0.5 transition-opacity duration-150"
                      style={{ color: 'var(--muted-foreground)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeWorkspace(ws.id)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--foreground)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--muted-foreground)'
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
        className="shrink-0 px-4 py-2 border-t flex flex-col gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Theme toggle buttons */}
        <div className="flex items-center gap-1">
          {themeOptions.map((opt) => {
            const Icon = opt.icon
            const isActive = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="no-drag flex items-center justify-center rounded p-1.5 transition-colors duration-150"
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--foreground)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--muted-foreground)'
                  }
                }}
                title={opt.title}
              >
                <Icon size={14} />
              </button>
            )
          })}
        </div>

        {/* Shortcut hint */}
        <span
          className="text-[10px] select-none"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {window.api?.platform === 'darwin' ? '⌘' : 'Ctrl+'}B to toggle
        </span>
      </div>
    </div>
  )
}

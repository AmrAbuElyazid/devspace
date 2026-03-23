import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkspaceStore } from '../store/workspace-store'

interface EditingState {
  tabId: string
  value: string
}

export default function TabBar(): React.JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const tabs = activeWorkspace?.tabs ?? []
  const activeTabId = activeWorkspace?.activeTabId ?? ''

  const [editing, setEditing] = useState<EditingState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitRename = useCallback(() => {
    if (!editing || !activeWorkspaceId) return
    const trimmed = editing.value.trim()
    const currentTab = tabs.find((t) => t.id === editing.tabId)
    if (trimmed && currentTab && trimmed !== currentTab.name) {
      renameTab(activeWorkspaceId, editing.tabId, trimmed)
    }
    setEditing(null)
  }, [editing, activeWorkspaceId, tabs, renameTab])

  const cancelRename = useCallback(() => {
    setEditing(null)
  }, [])

  const handleAddTab = useCallback(() => {
    if (activeWorkspaceId) addTab(activeWorkspaceId)
  }, [activeWorkspaceId, addTab])

  const handleRemoveTab = useCallback(
    (tabId: string) => {
      if (activeWorkspaceId) removeTab(activeWorkspaceId, tabId)
    },
    [activeWorkspaceId, removeTab],
  )

  if (!activeWorkspace) return <div style={{ height: 36 }} />

  return (
    <div
      className="shrink-0 flex items-end border-b overflow-x-auto"
      style={{
        height: 36,
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Tab list */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isEditing = editing?.tabId === tab.id

        return (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 shrink-0 px-3 h-full cursor-pointer text-xs select-none transition-colors duration-150',
            )}
            style={{
              maxWidth: 180,
              minWidth: 80,
              backgroundColor: isActive ? 'var(--card)' : undefined,
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
            onClick={() => {
              if (!isEditing) setActiveTab(activeWorkspaceId, tab.id)
            }}
            onDoubleClick={() => {
              setEditing({ tabId: tab.id, value: tab.name })
            }}
            onMouseDown={(e) => {
              // Middle click to close
              if (e.button === 1) {
                e.preventDefault()
                handleRemoveTab(tab.id)
              }
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
                className="flex-1 bg-transparent text-xs outline-none border rounded px-1 py-0"
                style={{
                  color: 'var(--foreground)',
                  borderColor: 'var(--primary)',
                  minWidth: 40,
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
                <span className="truncate">{tab.name}</span>
                <button
                  className={cn(
                    'flex items-center justify-center rounded p-0.5 transition-opacity duration-150',
                    isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
                  )}
                  style={{ color: 'var(--muted-foreground)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveTab(tab.id)
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--foreground)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted-foreground)'
                  }}
                  title="Close tab"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        )
      })}

      {/* Add tab button */}
      <button
        onClick={handleAddTab}
        className="shrink-0 flex items-center justify-center h-full px-2 transition-colors duration-150"
        style={{ color: 'var(--muted-foreground)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--foreground)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--muted-foreground)'
        }}
        title="Add tab"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

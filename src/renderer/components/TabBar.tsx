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

  if (!activeWorkspace) return <div style={{ height: 'var(--tabbar-height)' }} />

  return (
    <div
      className="shrink-0 flex items-end overflow-x-auto"
      style={{
        height: 'var(--tabbar-height)',
        backgroundColor: 'var(--background)',
        borderBottom: '1px solid var(--border)',
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
              'group tab-item flex items-center gap-1.5 shrink-0 px-3 h-full cursor-pointer text-xs select-none',
              isActive && 'tab-active',
            )}
            style={{
              maxWidth: 180,
              minWidth: 80,
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontWeight: isActive ? 500 : 400,
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
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-xs outline-none border rounded-md px-1.5 py-0"
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
                    'tab-close flex items-center justify-center rounded p-0.5',
                    isActive
                      ? 'opacity-50 hover:opacity-100'
                      : 'opacity-0 group-hover:opacity-50 hover:!opacity-100',
                  )}
                  style={{ color: 'var(--muted-foreground)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveTab(tab.id)
                  }}
                  title="Close tab"
                >
                  <X size={11} />
                </button>
              </>
            )}
          </div>
        )
      })}

      {/* Add tab button */}
      <button
        onClick={handleAddTab}
        className="tab-add-btn shrink-0 flex items-center justify-center h-full px-2"
        style={{ color: 'var(--muted-foreground)' }}
        title="Add tab"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

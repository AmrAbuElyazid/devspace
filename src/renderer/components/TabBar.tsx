import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'

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

  if (!activeWorkspace) return <div style={{ height: 44 }} />

  return (
    <div className="tabbar" style={{ position: 'relative' }}>
      {/* Invisible drag region behind tabs */}
      <div className="tabbar-drag drag-region" />

      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isEditing = editing?.tabId === tab.id

        return (
          <div
            key={tab.id}
            className={`tab no-drag ${isActive ? 'tab-active' : ''}`}
            onClick={() => { if (!isEditing) setActiveTab(activeWorkspaceId, tab.id) }}
            onDoubleClick={() => setEditing({ tabId: tab.id, value: tab.name })}
            onMouseDown={(e) => {
              if (e.button === 1) { e.preventDefault(); removeTab(activeWorkspaceId, tab.id) }
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--foreground)', minWidth: 40 }}
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
                <span className="truncate">{tab.name}</span>
                <Tooltip content="Close tab" shortcut="⌘W">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="tab-close no-drag"
                    onClick={(e) => { e.stopPropagation(); removeTab(activeWorkspaceId, tab.id) }}
                  >
                    <X size={11} />
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        )
      })}

      <Tooltip content="New tab" shortcut="⌘T">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => addTab(activeWorkspaceId)}
          className="tab-add no-drag"
        >
          <Plus size={13} />
        </Button>
      </Tooltip>
    </div>
  )
}

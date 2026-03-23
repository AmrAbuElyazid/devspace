import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { InlineRenameInput } from './ui/InlineRenameInput'

export default function TabBar(): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const tabs = activeWorkspace?.tabs ?? []
  const activeTabId = activeWorkspace?.activeTabId ?? ''

  const [editingTabId, setEditingTabId] = useState<string | null>(null)

  if (!activeWorkspace) return <div style={{ height: 44 }} />

  return (
    <div className="tabbar" style={{ position: 'relative' }}>
      {/* Invisible drag region behind tabs */}
      <div className="tabbar-drag drag-region" />

      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isEditing = editingTabId === tab.id

        return (
          <div
            key={tab.id}
            className={`tab no-drag ${isActive ? 'tab-active' : ''}`}
            onClick={() => { if (!isEditing) setActiveTab(activeWorkspaceId, tab.id) }}
            onDoubleClick={() => setEditingTabId(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1) { e.preventDefault(); removeTab(activeWorkspaceId, tab.id) }
            }}
          >
            {editingTabId === tab.id ? (
              <InlineRenameInput
                initialValue={tab.name}
                onCommit={(newName) => {
                  renameTab(activeWorkspaceId, tab.id, newName)
                  setEditingTabId(null)
                }}
                onCancel={() => setEditingTabId(null)}
                className="text-xs"
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

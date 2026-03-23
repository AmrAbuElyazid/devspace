import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useWorkspaceStore } from '../store/workspace-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { InlineRenameInput } from './ui/InlineRenameInput'
import type { DragItemData } from '../types/dnd'
import type { Tab } from '../types/workspace'

// ---------------------------------------------------------------------------
// SortableTab sub-component
// ---------------------------------------------------------------------------

function SortableTab({
  tab,
  workspaceId,
  isActive,
  isEditing,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onClose,
}: {
  tab: Tab
  workspaceId: string
  isActive: boolean
  isEditing: boolean
  onSelect: () => void
  onStartEditing: () => void
  onRename: (name: string) => void
  onStopEditing: () => void
  onClose: () => void
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `tab-${tab.id}`,
    data: { type: 'tab', workspaceId, tabId: tab.id } satisfies DragItemData,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tab no-drag cursor-grab ${isActive ? 'tab-active' : ''} ${isDragging ? 'tab-dragging' : ''}`}
      onClick={() => { if (!isEditing) onSelect() }}
      onDoubleClick={onStartEditing}
      onMouseDown={(e) => {
        if (e.button === 1) { e.preventDefault(); onClose() }
      }}
      {...attributes}
      {...listeners}
    >
      {isEditing ? (
        <InlineRenameInput
          initialValue={tab.name}
          onCommit={(newName) => {
            onRename(newName)
            onStopEditing()
          }}
          onCancel={onStopEditing}
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
              onClick={(e) => { e.stopPropagation(); onClose() }}
            >
              <X size={11} />
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TabBar
// ---------------------------------------------------------------------------

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

      <SortableContext items={tabs.map((t) => `tab-${t.id}`)} strategy={horizontalListSortingStrategy}>
        {tabs.map((tab) => (
          <SortableTab
            key={tab.id}
            tab={tab}
            workspaceId={activeWorkspaceId}
            isActive={tab.id === activeTabId}
            isEditing={editingTabId === tab.id}
            onSelect={() => setActiveTab(activeWorkspaceId, tab.id)}
            onStartEditing={() => setEditingTabId(tab.id)}
            onRename={(name) => renameTab(activeWorkspaceId, tab.id, name)}
            onStopEditing={() => setEditingTabId(null)}
            onClose={() => removeTab(activeWorkspaceId, tab.id)}
          />
        ))}
      </SortableContext>

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

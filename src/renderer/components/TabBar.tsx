import { useState, useRef, useCallback } from 'react'
import { Globe, Plus, X } from 'lucide-react'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useWorkspaceStore } from '../store/workspace-store'
import { useBrowserStore } from '../store/browser-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { InlineRenameInput } from './ui/InlineRenameInput'
import { useInsertionIndicator } from '../hooks/useInsertionIndicator'
import { useDragContext } from '../hooks/useDragAndDrop'
import type { DragItemData } from '../types/dnd'
import type { Pane, Tab } from '../types/workspace'
import type { BrowserStoreState } from '../store/browser-store'

function findPrimaryPaneId(tab: Tab): string | null {
  if (tab.focusedPaneId) {
    return tab.focusedPaneId
  }

  let node = tab.root
  while (node.type === 'branch' && node.children.length > 0) {
    node = node.children[0]
  }

  return node.type === 'leaf' ? node.paneId : null
}

function getTabChrome(tab: Tab, panes: Record<string, Pane>, runtimeByPaneId: BrowserStoreState['runtimeByPaneId']): {
  title: string
  faviconUrl: string | null
} {
  const primaryPaneId = findPrimaryPaneId(tab)
  if (!primaryPaneId) {
    return { title: tab.name, faviconUrl: null }
  }

  const pane = panes[primaryPaneId]
  if (pane?.type !== 'browser') {
    return { title: tab.name, faviconUrl: null }
  }

  const runtime = runtimeByPaneId[primaryPaneId]
  return {
    title: runtime?.title || pane.title || tab.name,
    faviconUrl: runtime?.faviconUrl ?? null,
  }
}

// ---------------------------------------------------------------------------
// SortableTab sub-component
// ---------------------------------------------------------------------------

function SortableTab({
  tab,
  workspaceId,
  isActive,
  isEditing,
  title,
  faviconUrl,
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
  title: string
  faviconUrl: string | null
  onSelect: () => void
  onStartEditing: () => void
  onRename: (name: string) => void
  onStopEditing: () => void
  onClose: () => void
}): JSX.Element {
  const tabRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver,
  } = useSortable({
    id: `tab-${tab.id}`,
    data: { type: 'tab', workspaceId, tabId: tab.id } satisfies DragItemData,
  })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      tabRef.current = el
      setNodeRef(el)
    },
    [setNodeRef],
  )

  // Insertion line indicator — tabs stay in place, line shows where drop will go
  const activeDrag = useDragContext()
  const isTabDrag = activeDrag?.type === 'tab'
  const insertPosition = useInsertionIndicator(isOver && !isDragging && isTabDrag, false, tabRef, 'horizontal')
  const insertClass = insertPosition === 'before' ? 'tab-insert-before' : insertPosition === 'after' ? 'tab-insert-after' : ''

  return (
    <div
      ref={setRef}
      data-sortable-id={`tab-${tab.id}`}
      className={`tab no-drag cursor-grab ${isActive ? 'tab-active' : ''} ${isDragging ? 'tab-dragging' : ''} ${insertClass}`}
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
          <span className="tab-favicon" aria-hidden="true">
            {faviconUrl ? <img src={faviconUrl} alt="" className="tab-favicon-image" /> : <Globe size={12} />}
          </span>
          <span className="truncate">{title}</span>
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
  const panes = useWorkspaceStore((s) => s.panes)
  const runtimeByPaneId = useBrowserStore((s) => s.runtimeByPaneId)

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
        {tabs.map((tab) => {
          const chrome = getTabChrome(tab, panes, runtimeByPaneId)
          return (
          <SortableTab
            key={tab.id}
            tab={tab}
            workspaceId={activeWorkspaceId}
            isActive={tab.id === activeTabId}
            isEditing={editingTabId === tab.id}
            title={chrome.title}
            faviconUrl={chrome.faviconUrl}
            onSelect={() => setActiveTab(activeWorkspaceId, tab.id)}
            onStartEditing={() => setEditingTabId(tab.id)}
            onRename={(name) => renameTab(activeWorkspaceId, tab.id, name)}
            onStopEditing={() => setEditingTabId(null)}
            onClose={() => removeTab(activeWorkspaceId, tab.id)}
          />
          )
        })}
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

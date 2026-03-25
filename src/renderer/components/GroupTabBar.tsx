import { useCallback } from 'react'
import { Terminal, FileCode, Globe, Square, Plus, Columns2, Rows2, X } from 'lucide-react'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useWorkspaceStore, collectGroupIds } from '../store/workspace-store'
import { Button } from './ui/button'
import type { PaneGroup, PaneType } from '../types/workspace'
import type { DragItemData } from '../types/dnd'

const typeIcons: Record<PaneType, typeof Terminal> = {
  terminal: Terminal,
  editor: FileCode,
  browser: Globe,
  empty: Square,
}

interface GroupTabBarProps {
  group: PaneGroup
  groupId: string
  workspaceId: string
  isFocused: boolean
}

function SortableGroupTab({
  tabId,
  paneId,
  groupId,
  workspaceId,
  isActive,
  onSelect,
  onClose,
}: {
  tabId: string
  paneId: string
  groupId: string
  workspaceId: string
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const pane = useWorkspaceStore((s) => s.panes[paneId])
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `gtab-${tabId}`,
    data: { type: 'group-tab', workspaceId, groupId, tabId } satisfies DragItemData,
  })

  const Icon = pane ? typeIcons[pane.type] : Square

  return (
    <div
      ref={setNodeRef}
      data-sortable-id={`gtab-${tabId}`}
      className={`group-tab ${isActive ? 'group-tab-active' : ''} ${isDragging ? 'group-tab-dragging' : ''}`}
      onClick={onSelect}
      onMouseDown={(e) => {
        if (e.button === 1) { e.preventDefault(); onClose() }
      }}
      {...attributes}
      {...listeners}
    >
      <Icon size={10} className="tab-icon" />
      <span className="truncate">{pane?.title ?? 'Empty'}</span>
      <button
        className="tab-close no-drag"
        onClick={(e) => { e.stopPropagation(); onClose() }}
      >
        <X size={9} />
      </button>
    </div>
  )
}

export default function GroupTabBar({ group, groupId, workspaceId, isFocused }: GroupTabBarProps) {
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab)
  const removeGroupTab = useWorkspaceStore((s) => s.removeGroupTab)
  const setActiveGroupTab = useWorkspaceStore((s) => s.setActiveGroupTab)
  const splitGroup = useWorkspaceStore((s) => s.splitGroup)
  const closeGroup = useWorkspaceStore((s) => s.closeGroup)
  const wsRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.root)

  const hasMultipleGroups = wsRoot ? collectGroupIds(wsRoot).length > 1 : false

  return (
    <div className={`group-tabbar ${isFocused ? 'group-focused' : ''}`}>
      <SortableContext items={group.tabs.map((t) => `gtab-${t.id}`)} strategy={horizontalListSortingStrategy}>
        {group.tabs.map((tab) => (
          <SortableGroupTab
            key={tab.id}
            tabId={tab.id}
            paneId={tab.paneId}
            groupId={groupId}
            workspaceId={workspaceId}
            isActive={tab.id === group.activeTabId}
            onSelect={() => setActiveGroupTab(workspaceId, groupId, tab.id)}
            onClose={() => removeGroupTab(workspaceId, groupId, tab.id)}
          />
        ))}
      </SortableContext>

      <button
        className="group-tabbar-add no-drag"
        onClick={() => addGroupTab(workspaceId, groupId)}
        title="New tab"
      >
        <Plus size={12} />
      </button>

      <div className="group-tabbar-actions">
        <button
          className="group-tabbar-action no-drag"
          onClick={() => splitGroup(workspaceId, groupId, 'horizontal')}
          title="Split Right"
        >
          <Columns2 size={12} />
        </button>
        <button
          className="group-tabbar-action no-drag"
          onClick={() => splitGroup(workspaceId, groupId, 'vertical')}
          title="Split Down"
        >
          <Rows2 size={12} />
        </button>
        {hasMultipleGroups && (
          <button
            className="group-tabbar-action no-drag"
            onClick={() => closeGroup(workspaceId, groupId)}
            title="Close Split"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

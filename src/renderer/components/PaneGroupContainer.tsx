import { memo, useCallback, useEffect, type ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { shouldHideBrowserNativeViewForDrag } from '../lib/browser-pane-visibility'
import { useWorkspaceStore, getTopLeftGroupId } from '../store/workspace-store'
import { useDragContext } from '../hooks/useDragAndDrop'
import GroupTabBar from './GroupTabBar'
import type { PaneType, TerminalConfig, EditorConfig, BrowserConfig } from '../types/workspace'
import type { DropSide } from '../types/dnd'

// Import the actual pane content components
import EmptyPane from './EmptyPane'
import TerminalPane from './TerminalPane'
import EditorPane from './EditorPane'
import BrowserPane from './BrowserPane'

const SIDES: DropSide[] = ['left', 'right', 'top', 'bottom']

function PaneEdgeDropZone({ groupId, workspaceId, side }: { groupId: string; workspaceId: string; side: DropSide }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `edge-${groupId}-${side}`,
    data: { type: 'pane-edge', workspaceId, groupId, side },
  })

  // Detection zone: 25% depth from edge, covers full extent of that side
  const zoneStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 11,
    pointerEvents: 'auto',
    ...(side === 'left'   ? { top: 0, left: 0, bottom: 0, width: '25%' } : {}),
    ...(side === 'right'  ? { top: 0, right: 0, bottom: 0, width: '25%' } : {}),
    ...(side === 'top'    ? { top: 0, left: 0, right: 0, height: '25%' } : {}),
    ...(side === 'bottom' ? { bottom: 0, left: 0, right: 0, height: '25%' } : {}),
  }

  return (
    <>
      <div ref={setNodeRef} style={zoneStyle} />
      {isOver && <div className={`pane-drop-zone-half ${side}`} />}
    </>
  )
}

interface PaneGroupContainerProps {
  groupId: string
  workspaceId: string
  overlayActive: boolean
  sidebarOpen: boolean
}

// Memoized inner component that renders the right content based on pane type
const PaneContent = memo(function PaneContent({
  paneId,
  paneType,
  paneConfig,
  workspaceId,
  groupId,
  isVisible,
  hideNativeView,
  isFocused,
}: {
  paneId: string
  paneType: PaneType
  paneConfig: unknown
  workspaceId: string
  groupId: string
  isVisible: boolean
  hideNativeView: boolean
  isFocused: boolean
}): ReactElement {
  switch (paneType) {
    case 'empty':
      return <EmptyPane paneId={paneId} workspaceId={workspaceId} groupId={groupId} />
    case 'terminal':
      return (
        <TerminalPane
          paneId={paneId}
          config={(paneConfig ?? {}) as TerminalConfig}
          isVisible={isVisible}
          hideNativeView={hideNativeView}
          isFocused={isFocused}
        />
      )
    case 'editor':
      return (
        <EditorPane
          paneId={paneId}
          config={(paneConfig ?? {}) as EditorConfig}
          isVisible={isVisible}
          hideNativeView={hideNativeView}
        />
      )
    case 'browser':
      return (
        <BrowserPane
          paneId={paneId}
          workspaceId={workspaceId}
          config={(paneConfig ?? { url: 'https://www.google.com' }) as BrowserConfig}
          isVisible={isVisible}
          hideNativeView={hideNativeView}
        />
      )
  }
})

export default function PaneGroupContainer({
  groupId,
  workspaceId,
  overlayActive,
  sidebarOpen,
}: PaneGroupContainerProps): ReactElement | null {
  const group = useWorkspaceStore((s) => s.paneGroups[groupId])
  const topLeftGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId)
    return ws ? getTopLeftGroupId(ws.root) : null
  })
  const isTopLeftGroup = !sidebarOpen && groupId === topLeftGroupId
  const panes = useWorkspaceStore((s) => s.panes)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const focusedGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId)
    return ws?.focusedGroupId ?? null
  })
  const setFocusedGroup = useWorkspaceStore((s) => s.setFocusedGroup)

  const activeDrag = useDragContext()
  const isVisibleWorkspace = workspaceId === activeWorkspaceId
  const isFocused = focusedGroupId === groupId
  const shouldHideNative = overlayActive || shouldHideBrowserNativeViewForDrag(activeDrag, isVisibleWorkspace)

  const handleFocus = useCallback(() => {
    setFocusedGroup(workspaceId, groupId)
  }, [setFocusedGroup, workspaceId, groupId])

  // Auto-repair: if group not found, create one
  useEffect(() => {
    if (!group) {
      console.warn(`[PaneGroupContainer] Group "${groupId}" not found — this shouldn't happen`)
    }
  }, [group, groupId])

  if (!group) return null

  return (
    <div className="pane-group" onMouseDown={handleFocus}>
      <GroupTabBar
        group={group}
        groupId={groupId}
        workspaceId={workspaceId}
        isFocused={isFocused}
        isTopLeftGroup={isTopLeftGroup}
      />
      <div className="pane-group-content">
        {activeDrag?.type === 'group-tab' && (
          <div className="pane-drop-zone-overlay" style={{ pointerEvents: 'auto' }}>
            {SIDES.map((side) => (
              <PaneEdgeDropZone
                key={side}
                groupId={groupId}
                workspaceId={workspaceId}
                side={side}
              />
            ))}
          </div>
        )}
        {group.tabs.map((tab) => {
          const isActiveTab = tab.id === group.activeTabId
          const pane = panes[tab.paneId]
          if (!pane) return null

          return (
            <div
              key={tab.paneId}
              className="pane-tab-layer"
              data-active={isActiveTab || undefined}
            >
              <PaneContent
                paneId={tab.paneId}
                paneType={pane.type}
                paneConfig={pane.config}
                workspaceId={workspaceId}
                groupId={groupId}
                isVisible={isVisibleWorkspace && isActiveTab}
                hideNativeView={shouldHideNative || !isActiveTab}
                isFocused={isFocused && isActiveTab}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { memo, useCallback, useEffect, useRef, useState, useMemo, type ElementType, type ReactElement } from 'react'
import { Terminal, FileCode, Globe, Square, Columns2, Rows2, X } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { shouldHideBrowserNativeViewForDrag } from '../lib/browser-pane-visibility'
import { useWorkspaceStore } from '../store/workspace-store'
import { useDragContext } from '../hooks/useDragAndDrop'
import EmptyPane from './EmptyPane'
import TerminalPane from './TerminalPane'
import EditorPane from './EditorPane'
import BrowserPane from './BrowserPane'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import type { ContextMenuItem } from '../../shared/types'
import type { PaneType, TerminalConfig, EditorConfig, BrowserConfig } from '../types/workspace'
import type { DropSide } from '../types/dnd'

interface PaneContainerProps {
  paneId: string
  workspaceId: string
  tabId: string
}

const paneTypeIcons: Record<PaneType, ElementType> = {
  terminal: Terminal,
  editor: FileCode,
  browser: Globe,
  empty: Square,
}

const PaneContent = memo(function PaneContent({
  paneId,
  pane,
  workspaceId,
  tabId,
  isVisible,
  hideNativeView,
}: {
  paneId: string
  pane: { type: PaneType; config: unknown }
  workspaceId: string
  tabId: string
  isVisible: boolean
  hideNativeView: boolean
}): ReactElement {
  switch (pane.type) {
    case 'empty':
      return <EmptyPane paneId={paneId} workspaceId={workspaceId} tabId={tabId} />
    case 'terminal':
      return <TerminalPane paneId={paneId} config={(pane.config ?? {}) as TerminalConfig} />
    case 'editor':
      return <EditorPane paneId={paneId} config={(pane.config ?? {}) as EditorConfig} />
    case 'browser':
      return (
        <BrowserPane
          paneId={paneId}
          workspaceId={workspaceId}
          config={(pane.config ?? { url: 'https://www.google.com' }) as BrowserConfig}
          isVisible={isVisible}
          hideNativeView={hideNativeView}
        />
      )
  }
})

export default function PaneContainer({
  paneId,
  workspaceId,
  tabId,
}: PaneContainerProps): ReactElement | null {
  const pane = useWorkspaceStore((s) => s.panes[paneId])
  const splitPane = useWorkspaceStore((s) => s.splitPane)
  const closePane = useWorkspaceStore((s) => s.closePane)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setFocusedPane = useWorkspaceStore((s) => s.setFocusedPane)

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWs?.tabs.find((t) => t.id === activeWs.activeTabId)
  const isFocused = activeTab?.focusedPaneId === paneId

  // --- DnD drop zone ---
  const activeDrag = useDragContext()
  const paneRef = useRef<HTMLDivElement>(null)
  const [dropSide, setDropSide] = useState<DropSide | null>(null)

  // Only enable pane zone drop targets for the VISIBLE tab.
  // All tabs are rendered stacked (visibility:hidden for inactive ones),
  // so hidden PaneContainers have the same bounding rect as visible ones.
  // Without this check, pointerWithin matches hidden pane zones, causing
  // the overlay to render on invisible elements and merges into wrong tabs.
  const isVisibleTab = workspaceId === activeWorkspaceId && tabId === activeWs?.activeTabId
  const shouldHideBrowserNativeView = shouldHideBrowserNativeViewForDrag(activeDrag, isVisibleTab)
  const canAcceptTabDrop =
    activeDrag?.type === 'tab' &&
    isVisibleTab &&
    activeDrag.tabId !== tabId // prevent self-merge (dragging active tab onto its own pane)

  // Don't include `side` in droppable data — it creates a stale-state problem.
  // The hook computes the side at drop time from pointer position + pane rect.
  // `side` is only used here for the visual overlay.
  const droppableData = useMemo(() => ({
    type: 'pane-zone' as const,
    workspaceId,
    tabId,
    paneId,
    side: dropSide, // read by hook as fallback only
  }), [workspaceId, tabId, paneId, dropSide])

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `pane-zone-${paneId}`,
    data: droppableData,
    disabled: !canAcceptTabDrop,
  })

  useEffect(() => {
    if (!isOver || activeDrag?.type !== 'tab' || !paneRef.current) {
      setDropSide(null)
      return
    }
    const paneEl = paneRef.current
    function handlePointerMove(e: PointerEvent): void {
      const rect = paneEl.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / rect.width
      const relY = (e.clientY - rect.top) / rect.height
      const distLeft = relX
      const distRight = 1 - relX
      const distTop = relY
      const distBottom = 1 - relY
      const min = Math.min(distLeft, distRight, distTop, distBottom)
      let side: DropSide = 'left'
      if (min === distRight) side = 'right'
      else if (min === distTop) side = 'top'
      else if (min === distBottom) side = 'bottom'
      setDropSide(side)
    }
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [isOver, activeDrag])

  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    paneRef.current = el
    setDropRef(el)
  }, [setDropRef])

  const handleSplitH = useCallback(() => splitPane(workspaceId, tabId, paneId, 'horizontal'), [splitPane, workspaceId, tabId, paneId])
  const handleSplitV = useCallback(() => splitPane(workspaceId, tabId, paneId, 'vertical'), [splitPane, workspaceId, tabId, paneId])
  const handleClose = useCallback(() => closePane(workspaceId, tabId, paneId), [closePane, workspaceId, tabId, paneId])
  const handleFocus = useCallback(() => {
    setFocusedPane(workspaceId, tabId, paneId)
  }, [setFocusedPane, workspaceId, tabId, paneId])

  // Auto-repair: if pane not found, create an empty pane
  useEffect(() => {
    if (!pane) {
      console.warn(`[PaneContainer] Pane "${paneId}" not found — auto-creating empty pane`)
      useWorkspaceStore.setState((state) => ({
        panes: {
          ...state.panes,
          [paneId]: { id: paneId, type: 'empty' as const, title: 'Empty', config: {} },
        },
      }))
    }
  }, [pane, paneId])

  if (!pane) {
    return null // Renders nothing for one frame, then re-renders with the new pane
  }

  const TypeIcon = paneTypeIcons[pane.type]

  const dropOverlay = isOver && activeDrag?.type === 'tab' && dropSide ? (
    <div className="pane-drop-zone-overlay">
      <div className={`pane-drop-zone-half ${dropSide}`} />
    </div>
  ) : null

  // For empty panes, don't show the toolbar — show the selector directly
  if (pane.type === 'empty') {
    return (
      <div
        ref={mergedRef}
        data-pane-drop-id={paneId}
        className={`h-full w-full pane-focus-ring ${isFocused ? 'pane-focused' : ''}`}
        style={{ position: 'relative' }}
        onMouseDown={handleFocus}
      >
        <PaneContent
          paneId={paneId}
          pane={pane}
          workspaceId={workspaceId}
          tabId={tabId}
          isVisible={isVisibleTab}
          hideNativeView={Boolean(shouldHideBrowserNativeView)}
        />
        {dropOverlay}
      </div>
    )
  }

  return (
    <div
      ref={mergedRef}
      data-pane-drop-id={paneId}
      className={`h-full w-full flex flex-col pane-focus-ring ${isFocused ? 'pane-focused' : ''}`}
      style={{ position: 'relative' }}
      onMouseDown={handleFocus}
    >
      <div
        className="pane-toolbar"
        onContextMenu={async (e) => {
          e.preventDefault()
          const items: ContextMenuItem[] = [
            { id: 'split-h', label: 'Split Right' },
            { id: 'split-v', label: 'Split Down' },
            { id: 'close', label: 'Close Pane', destructive: true },
          ]
          const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY })
          if (result === 'split-h') handleSplitH()
          else if (result === 'split-v') handleSplitV()
          else if (result === 'close') handleClose()
        }}
      >
        <div className="pane-toolbar-title">
          <TypeIcon size={12} style={{ opacity: 0.6 }} />
          <span>{pane.title}</span>
        </div>
        <div className="pane-actions">
          <Tooltip content="Split Right" shortcut="⌘D">
            <Button
              variant="ghost"
              size="icon-sm"
              className="pane-action"
              onClick={handleSplitH}
            >
              <Columns2 size={12} />
            </Button>
          </Tooltip>
          <Tooltip content="Split Down" shortcut="⌘⇧D">
            <Button
              variant="ghost"
              size="icon-sm"
              className="pane-action"
              onClick={handleSplitV}
            >
              <Rows2 size={12} />
            </Button>
          </Tooltip>
          <Tooltip content="Close Pane">
            <Button
              variant="ghost"
              size="icon-sm"
              className="pane-action pane-action-close"
              onClick={handleClose}
            >
              <X size={12} />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="pane-content-frame flex-1 overflow-hidden">
        <PaneContent
          paneId={paneId}
          pane={pane}
          workspaceId={workspaceId}
          tabId={tabId}
          isVisible={isVisibleTab}
          hideNativeView={Boolean(shouldHideBrowserNativeView)}
        />
      </div>
      {dropOverlay}
    </div>
  )
}

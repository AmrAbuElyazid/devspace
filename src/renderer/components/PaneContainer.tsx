import { memo, useCallback, useEffect, type ElementType } from 'react'
import { Terminal, FileCode, Globe, Square, Columns2, Rows2, X } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import EmptyPane from './EmptyPane'
import TerminalPane from './TerminalPane'
import EditorPane from './EditorPane'
import BrowserPane from './BrowserPane'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import type { ContextMenuItem } from '../../shared/types'
import type { PaneType, TerminalConfig, EditorConfig, BrowserConfig } from '../types/workspace'

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

const PaneContent = memo(function PaneContent({ paneId, pane, workspaceId, tabId }: { paneId: string; pane: { type: PaneType; config: unknown }; workspaceId: string; tabId: string }): JSX.Element {
  switch (pane.type) {
    case 'empty':
      return <EmptyPane paneId={paneId} workspaceId={workspaceId} tabId={tabId} />
    case 'terminal':
      return <TerminalPane paneId={paneId} config={(pane.config ?? {}) as TerminalConfig} />
    case 'editor':
      return <EditorPane paneId={paneId} config={(pane.config ?? {}) as EditorConfig} />
    case 'browser':
      return <BrowserPane paneId={paneId} config={(pane.config ?? { url: 'https://www.google.com' }) as BrowserConfig} />
  }
})

export default function PaneContainer({
  paneId,
  workspaceId,
  tabId,
}: PaneContainerProps): JSX.Element | null {
  const pane = useWorkspaceStore((s) => s.panes[paneId])
  const splitPane = useWorkspaceStore((s) => s.splitPane)
  const closePane = useWorkspaceStore((s) => s.closePane)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setFocusedPane = useWorkspaceStore((s) => s.setFocusedPane)

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWs?.tabs.find((t) => t.id === activeWs.activeTabId)
  const isFocused = activeTab?.focusedPaneId === paneId

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

  // For empty panes, don't show the toolbar — show the selector directly
  if (pane.type === 'empty') {
    return (
      <div
        className={`h-full w-full pane-focus-ring ${isFocused ? 'pane-focused' : ''}`}
        onMouseDown={handleFocus}
      >
        <PaneContent paneId={paneId} pane={pane} workspaceId={workspaceId} tabId={tabId} />
      </div>
    )
  }

  return (
    <div
      className={`h-full w-full flex flex-col pane-focus-ring ${isFocused ? 'pane-focused' : ''}`}
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
      <div className="flex-1 overflow-hidden">
        <PaneContent paneId={paneId} pane={pane} workspaceId={workspaceId} tabId={tabId} />
      </div>
    </div>
  )
}

import React from 'react'
import { Terminal, FileCode, Globe, Square, Columns2, Rows2, X } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import EmptyPane from './EmptyPane'
import TerminalPane from './TerminalPane'
import EditorPane from './EditorPane'
import BrowserPane from './BrowserPane'
import type { PaneType, TerminalConfig, EditorConfig, BrowserConfig } from '../types/workspace'

interface PaneContainerProps {
  paneId: string
  workspaceId: string
  tabId: string
}

const paneTypeIcons: Record<PaneType, React.ElementType> = {
  terminal: Terminal,
  editor: FileCode,
  browser: Globe,
  empty: Square,
}

function PaneContent({ paneId, pane }: { paneId: string; pane: { type: PaneType; config: unknown } }): React.JSX.Element {
  switch (pane.type) {
    case 'empty':
      return <EmptyPane paneId={paneId} />
    case 'terminal':
      return <TerminalPane paneId={paneId} config={(pane.config ?? {}) as TerminalConfig} />
    case 'editor':
      return <EditorPane paneId={paneId} config={(pane.config ?? {}) as EditorConfig} />
    case 'browser':
      return <BrowserPane paneId={paneId} config={(pane.config ?? { url: 'https://www.google.com' }) as BrowserConfig} />
  }
}

export default function PaneContainer({
  paneId,
  workspaceId,
  tabId,
}: PaneContainerProps): React.JSX.Element {
  const pane = useWorkspaceStore((s) => s.panes[paneId])
  const splitPane = useWorkspaceStore((s) => s.splitPane)
  const closePane = useWorkspaceStore((s) => s.closePane)

  if (!pane) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
        Pane not found
      </div>
    )
  }

  const TypeIcon = paneTypeIcons[pane.type]

  // For empty panes, don't show the toolbar — show the selector directly
  if (pane.type === 'empty') {
    return (
      <div className="h-full w-full group/pane">
        <PaneContent paneId={paneId} pane={pane} />
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col group/pane">
      <div className="pane-toolbar">
        <div className="pane-toolbar-title">
          <TypeIcon size={12} style={{ opacity: 0.6 }} />
          <span>{pane.title}</span>
        </div>
        <div className="pane-actions">
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'horizontal')}
            className="pane-action"
            title="Split Right"
          >
            <Columns2 size={12} />
          </button>
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'vertical')}
            className="pane-action"
            title="Split Down"
          >
            <Rows2 size={12} />
          </button>
          <button
            onClick={() => closePane(workspaceId, tabId, paneId)}
            className="pane-action pane-action-close"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <PaneContent paneId={paneId} pane={pane} />
      </div>
    </div>
  )
}

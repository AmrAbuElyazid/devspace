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

  return (
    <div className="h-full w-full flex flex-col group/pane">
      {/* Toolbar — refined, thinner */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          height: 24,
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: icon + title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon size={12} style={{ color: 'var(--muted-foreground)', opacity: 0.7 }} className="shrink-0" />
          <span
            className="text-[11px] truncate"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {pane.title}
          </span>
        </div>

        {/* Right: action buttons (visible on hover) */}
        <div className="flex items-center gap-px opacity-0 group-hover/pane:opacity-100 transition-opacity duration-[120ms]">
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'horizontal')}
            className="pane-action-btn flex items-center justify-center rounded"
            style={{ width: 18, height: 18, color: 'var(--muted-foreground)' }}
            title="Split Right"
          >
            <Columns2 size={11} />
          </button>
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'vertical')}
            className="pane-action-btn flex items-center justify-center rounded"
            style={{ width: 18, height: 18, color: 'var(--muted-foreground)' }}
            title="Split Down"
          >
            <Rows2 size={11} />
          </button>
          <button
            onClick={() => closePane(workspaceId, tabId, paneId)}
            className="pane-action-btn pane-action-close flex items-center justify-center rounded"
            style={{ width: 18, height: 18, color: 'var(--muted-foreground)' }}
            title="Close"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <PaneContent paneId={paneId} pane={pane} />
      </div>
    </div>
  )
}

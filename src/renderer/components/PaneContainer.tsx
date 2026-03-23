import React from 'react'
import { Terminal, FileCode, Globe, Square, Columns2, Rows2, X } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import EmptyPane from './EmptyPane'
import type { PaneType } from '../types/workspace'

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

function PaneContent({ paneId, type }: { paneId: string; type: PaneType }): React.JSX.Element {
  switch (type) {
    case 'empty':
      return <EmptyPane paneId={paneId} />
    case 'terminal':
      return (
        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Terminal: {paneId}
        </div>
      )
    case 'editor':
      return (
        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Editor: {paneId}
        </div>
      )
    case 'browser':
      return (
        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Browser: {paneId}
        </div>
      )
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
      {/* Toolbar */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          height: 28,
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: icon + title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon size={14} style={{ color: 'var(--muted-foreground)' }} className="shrink-0" />
          <span
            className="text-xs truncate"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {pane.title}
          </span>
        </div>

        {/* Right: action buttons (visible on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/pane:opacity-100 transition-opacity">
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'horizontal')}
            className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
            style={{ width: 20, height: 20, color: 'var(--muted-foreground)' }}
            title="Split Right"
          >
            <Columns2 size={12} />
          </button>
          <button
            onClick={() => splitPane(workspaceId, tabId, paneId, 'vertical')}
            className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
            style={{ width: 20, height: 20, color: 'var(--muted-foreground)' }}
            title="Split Down"
          >
            <Rows2 size={12} />
          </button>
          <button
            onClick={() => closePane(workspaceId, tabId, paneId)}
            className="flex items-center justify-center rounded hover:bg-[var(--destructive)]"
            style={{ width: 20, height: 20, color: 'var(--muted-foreground)' }}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <PaneContent paneId={paneId} type={pane.type} />
      </div>
    </div>
  )
}

import React from 'react'
import { Terminal, FileCode, Globe } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import type { PaneType, PaneConfig } from '../types/workspace'

interface EmptyPaneProps {
  paneId: string
}

const options: { type: PaneType; label: string; desc: string; icon: React.ElementType; defaultConfig: PaneConfig }[] = [
  { type: 'terminal', label: 'Terminal', desc: 'Shell session', icon: Terminal, defaultConfig: { cwd: undefined } },
  { type: 'editor', label: 'Editor', desc: 'Code editor', icon: FileCode, defaultConfig: {} },
  { type: 'browser', label: 'Browser', desc: 'Web preview', icon: Globe, defaultConfig: { url: 'https://google.com' } },
]

export default function EmptyPane({ paneId }: EmptyPaneProps): React.JSX.Element {
  const changePaneType = useWorkspaceStore((s) => s.changePaneType)

  return (
    <div className="empty-pane">
      <div style={{ textAlign: 'center' }}>
        <div className="empty-pane-label">Add a pane</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {options.map(({ type, label, desc, icon: Icon, defaultConfig }) => (
            <button
              key={type}
              onClick={() => changePaneType(paneId, type, defaultConfig)}
              className="empty-pane-card"
            >
              <Icon size={22} style={{ color: 'var(--muted-foreground)' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import React from 'react'
import { Terminal, FileCode, Globe } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import type { PaneType, PaneConfig } from '../types/workspace'

interface EmptyPaneProps {
  paneId: string
}

const options: { type: PaneType; label: string; icon: React.ElementType; defaultConfig: PaneConfig }[] = [
  { type: 'terminal', label: 'Terminal', icon: Terminal, defaultConfig: { cwd: undefined } },
  { type: 'editor', label: 'Editor', icon: FileCode, defaultConfig: {} },
  { type: 'browser', label: 'Browser', icon: Globe, defaultConfig: { url: 'https://google.com' } },
]

export default function EmptyPane({ paneId }: EmptyPaneProps): React.JSX.Element {
  const changePaneType = useWorkspaceStore((s) => s.changePaneType)

  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--muted)' }}
    >
      <div className="flex gap-4">
        {options.map(({ type, label, icon: Icon, defaultConfig }) => (
          <button
            key={type}
            onClick={() => changePaneType(paneId, type, defaultConfig)}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border transition-all duration-150 hover:scale-105"
            style={{
              width: 100,
              height: 90,
              borderColor: 'var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}
          >
            <Icon size={28} style={{ color: 'var(--muted-foreground)' }} />
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

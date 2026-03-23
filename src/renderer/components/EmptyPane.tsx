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
    <div
      className="h-full w-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="flex flex-col items-center gap-5">
        <span
          className="text-xs font-medium uppercase select-none"
          style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}
        >
          Add a pane
        </span>
        <div className="flex gap-3">
          {options.map(({ type, label, desc, icon: Icon, defaultConfig }) => (
            <button
              key={type}
              onClick={() => changePaneType(paneId, type, defaultConfig)}
              className="empty-pane-card flex flex-col items-center justify-center gap-2 border cursor-pointer"
              style={{
                width: 110,
                height: 100,
                borderRadius: 'var(--radius)',
                borderColor: 'var(--border)',
                backgroundColor: 'var(--card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <Icon size={24} style={{ color: 'var(--muted-foreground)' }} />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                  {label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                  {desc}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

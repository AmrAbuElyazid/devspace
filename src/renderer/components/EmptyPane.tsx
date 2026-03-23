import { type ElementType } from 'react'
import { Terminal, FileCode, Globe } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import type { PaneType, PaneConfig } from '../types/workspace'

interface EmptyPaneProps {
  paneId: string
}

const options: { type: PaneType; label: string; desc: string; icon: ElementType; defaultConfig: PaneConfig }[] = [
  { type: 'terminal', label: 'Terminal', desc: 'Shell session', icon: Terminal, defaultConfig: { cwd: undefined } },
  { type: 'editor', label: 'Editor', desc: 'Code editor', icon: FileCode, defaultConfig: {} },
  { type: 'browser', label: 'Browser', desc: 'Web preview', icon: Globe, defaultConfig: { url: 'https://google.com' } },
]

export default function EmptyPane({ paneId }: EmptyPaneProps): JSX.Element {
  const changePaneType = useWorkspaceStore((s) => s.changePaneType)

  return (
    <div className="empty-pane">
      <div style={{ textAlign: 'center' }}>
        <div className="empty-pane-label">Add a pane</div>
        <div className="flex gap-2.5">
          {options.map(({ type, label, desc, icon: Icon, defaultConfig }) => (
            <button
              key={type}
              type="button"
              onClick={() => changePaneType(paneId, type, defaultConfig)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  changePaneType(paneId, type, defaultConfig)
                }
              }}
              className="empty-pane-card"
            >
              <Icon size={22} className="text-muted-foreground" />
              <div>
                <div className="text-xs font-medium text-foreground">{label}</div>
                <div className="text-[10px] text-muted-foreground">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

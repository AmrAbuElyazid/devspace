import { type ElementType } from 'react'
import { Terminal, FileCode, Globe, X } from 'lucide-react'
import { useWorkspaceStore, collectGroupIds } from '../store/workspace-store'
import type { PaneType, PaneConfig } from '../types/workspace'

interface EmptyPaneProps {
  paneId: string
  workspaceId: string
  groupId: string
}

const options: { type: PaneType; label: string; desc: string; icon: ElementType; defaultConfig: PaneConfig }[] = [
  { type: 'terminal', label: 'Terminal', desc: 'Shell session', icon: Terminal, defaultConfig: { cwd: undefined } },
  { type: 'editor', label: 'VS Code', desc: 'Code editor', icon: FileCode, defaultConfig: {} },
  { type: 'browser', label: 'Browser', desc: 'Web preview', icon: Globe, defaultConfig: { url: 'https://google.com' } },
]

export default function EmptyPane({ paneId, workspaceId, groupId }: EmptyPaneProps): JSX.Element {
  const changePaneType = useWorkspaceStore((s) => s.changePaneType)
  const removeGroupTab = useWorkspaceStore((s) => s.removeGroupTab)
  const closeGroup = useWorkspaceStore((s) => s.closeGroup)
  const group = useWorkspaceStore((s) => s.paneGroups[groupId])
  const wsRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.root)

  const handleClose = () => {
    // Find the tab that references this pane
    const tab = group?.tabs.find((t) => t.paneId === paneId)
    if (!tab) return

    // If this is the only tab in the only group, close the group (which will
    // replace it with a fresh empty pane). Otherwise remove the tab.
    const hasMultipleGroups = wsRoot ? collectGroupIds(wsRoot).length > 1 : false
    if (group.tabs.length === 1 && hasMultipleGroups) {
      closeGroup(workspaceId, groupId)
    } else {
      removeGroupTab(workspaceId, groupId, tab.id)
    }
  }

  return (
    <div className="empty-pane relative">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded transition-colors"
        style={{ color: 'var(--foreground-faint)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--destructive)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground-faint)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
        }}
        title="Close pane"
      >
        <X size={14} />
      </button>

      {/* Existing content */}
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

import React from 'react'
import { useWorkspaceStore } from './store/workspace-store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SplitLayout from './components/SplitLayout'
import 'allotment/dist/style.css'

export default function App(): React.JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWorkspace?.tabs.find((t) => t.id === activeWorkspace.activeTabId)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBar />
          <div className="flex-1 overflow-hidden">
            {activeTab ? (
              <SplitLayout
                node={activeTab.root}
                workspaceId={activeWorkspace!.id}
                tabId={activeTab.id}
              />
            ) : (
              <div
                className="h-full flex items-center justify-center text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                No tab selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

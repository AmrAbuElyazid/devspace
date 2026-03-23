import React, { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SplitLayout from './components/SplitLayout'
import type { SplitNode } from './types/workspace'
import 'allotment/dist/style.css'

function findFirstLeaf(node: SplitNode): string | null {
  if (node.type === 'leaf') return node.paneId
  if (node.children.length > 0) return findFirstLeaf(node.children[0])
  return null
}

export default function App(): React.JSX.Element {
  useTheme()

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWorkspace?.tabs.find((t) => t.id === activeWorkspace.activeTabId)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const { key, shiftKey } = e
      const store = useWorkspaceStore.getState()
      const settings = useSettingsStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return

      if (key === 't' && !shiftKey) {
        e.preventDefault()
        store.addTab(ws.id)
        return
      }
      if (key === 'w' && !shiftKey) {
        e.preventDefault()
        store.removeTab(ws.id, ws.activeTabId)
        return
      }
      if (key === 'b' && !shiftKey) {
        e.preventDefault()
        settings.toggleSidebar()
        return
      }
      if (key === '\\' && !shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const paneId = findFirstLeaf(tab.root)
          if (paneId) store.splitPane(ws.id, tab.id, paneId, 'horizontal')
        }
        return
      }
      if ((key === '\\' || key === '|') && shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const paneId = findFirstLeaf(tab.root)
          if (paneId) store.splitPane(ws.id, tab.id, paneId, 'vertical')
        }
        return
      }
      const num = parseInt(key, 10)
      if (num >= 1 && num <= 9) {
        e.preventDefault()
        const targetIndex = num - 1
        if (targetIndex < ws.tabs.length) {
          store.setActiveTab(ws.id, ws.tabs[targetIndex].id)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Layout: sidebar on left, main area on right. No separate title bar.
  // The sidebar header and tab bar both act as the window chrome.
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TabBar />
        <div className="app-content" style={{ position: 'relative' }}>
          {/* Render ALL tabs stacked; hide inactive ones.
              This prevents terminal/editor unmount on tab switch,
              preserving PTY sessions and editor state. */}
          {activeWorkspace?.tabs.map((tab) => {
            const isActive = tab.id === activeWorkspace.activeTabId
            return (
              <div
                key={tab.id}
                className="app-tab-layer"
                data-active={isActive || undefined}
              >
                <SplitLayout
                  node={tab.root}
                  workspaceId={activeWorkspace.id}
                  tabId={tab.id}
                />
              </div>
            )
          })}
          {(!activeWorkspace || activeWorkspace.tabs.length === 0) && (
            <div className="h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
              No tab selected
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

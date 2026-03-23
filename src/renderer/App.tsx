import React, { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SplitLayout from './components/SplitLayout'
import type { SplitNode } from './types/workspace'
import { ToastViewport } from './components/ui/toast'
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
        <div className="app-content">
          {/* Render ALL tabs from ALL workspaces, stacked.
              Only the active workspace's active tab is visible.
              This prevents terminal/editor unmount on workspace or tab switch,
              preserving PTY sessions and editor state. */}
          {workspaces.map((ws) =>
            ws.tabs.map((tab) => {
              const isVisible = ws.id === activeWorkspaceId && tab.id === ws.activeTabId
              return (
                <div
                  key={`${ws.id}::${tab.id}`}
                  className="app-tab-layer"
                  data-active={isVisible || undefined}
                >
                  <SplitLayout
                    node={tab.root}
                    workspaceId={ws.id}
                    tabId={tab.id}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
      <ToastViewport />
    </div>
  )
}

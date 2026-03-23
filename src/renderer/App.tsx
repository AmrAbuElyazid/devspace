import { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SplitLayout from './components/SplitLayout'
import SettingsPage from './components/SettingsPage'
import type { SplitNode } from './types/workspace'
import { ToastViewport } from './components/ui/toast'

function findFirstLeaf(node: SplitNode): string | null {
  if (node.type === 'leaf') return node.paneId
  if (node.children.length > 0) return findFirstLeaf(node.children[0])
  return null
}

export default function App(): JSX.Element {
  useTheme()

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const settingsOpen = useSettingsStore((s) => s.settingsOpen)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWorkspace?.tabs.find((t) => t.id === activeWorkspace.activeTabId)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Escape (no mod key required)
      if (e.key === 'Escape') {
        const settings = useSettingsStore.getState()
        if (settings.settingsOpen) {
          settings.setSettingsOpen(false)
          e.preventDefault()
        }
        return
      }

      // Ctrl+1-9 for workspace switching (not Cmd)
      if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const store = useWorkspaceStore.getState()
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          const targetIndex = num - 1
          if (targetIndex < store.workspaces.length) {
            store.setActiveWorkspace(store.workspaces[targetIndex].id)
          }
        }
        return
      }

      // Cmd/Ctrl shortcuts
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const { key, shiftKey } = e
      const store = useWorkspaceStore.getState()
      const settings = useSettingsStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return

      if (key === 't' && !shiftKey) { e.preventDefault(); store.addTab(ws.id); return }
      if (key === 'w' && !shiftKey) { e.preventDefault(); store.removeTab(ws.id, ws.activeTabId); return }
      if (key === 'b' && !shiftKey) { e.preventDefault(); settings.toggleSidebar(); return }
      if (key === 'n' && !shiftKey) { e.preventDefault(); store.addWorkspace(); return }
      if (key === ',') { e.preventDefault(); settings.toggleSettings(); return }

      if (key === 'd' && !shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const targetPaneId = tab.focusedPaneId || findFirstLeaf(tab.root)
          if (targetPaneId) store.splitPane(ws.id, tab.id, targetPaneId, 'horizontal')
        }
        return
      }
      if (key === 'd' && shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const targetPaneId = tab.focusedPaneId || findFirstLeaf(tab.root)
          if (targetPaneId) store.splitPane(ws.id, tab.id, targetPaneId, 'vertical')
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

          {/* Settings overlay */}
          {settingsOpen && <SettingsPage />}
        </div>
      </div>
      <ToastViewport />
    </div>
  )
}

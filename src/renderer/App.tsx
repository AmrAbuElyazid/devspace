import React, { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useTheme } from './hooks/useTheme'
import TitleBar from './components/TitleBar'
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
  // Initialize theme system
  useTheme()

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWorkspace?.tabs.find((t) => t.id === activeWorkspace.activeTabId)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const isMod = e.metaKey || e.ctrlKey

      if (!isMod) return

      const { key, shiftKey } = e
      const store = useWorkspaceStore.getState()
      const settings = useSettingsStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return

      // Cmd+T — new tab
      if (key === 't' && !shiftKey) {
        e.preventDefault()
        store.addTab(ws.id)
        return
      }

      // Cmd+W — close active tab
      if (key === 'w' && !shiftKey) {
        e.preventDefault()
        store.removeTab(ws.id, ws.activeTabId)
        return
      }

      // Cmd+B — toggle sidebar
      if (key === 'b' && !shiftKey) {
        e.preventDefault()
        settings.toggleSidebar()
        return
      }

      // Cmd+\ — split horizontal
      if (key === '\\' && !shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const paneId = findFirstLeaf(tab.root)
          if (paneId) {
            store.splitPane(ws.id, tab.id, paneId, 'horizontal')
          }
        }
        return
      }

      // Cmd+Shift+\ — split vertical
      if ((key === '\\' || key === '|') && shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const paneId = findFirstLeaf(tab.root)
          if (paneId) {
            store.splitPane(ws.id, tab.id, paneId, 'vertical')
          }
        }
        return
      }

      // Cmd+1 through Cmd+9 — switch to tab N
      const num = parseInt(key, 10)
      if (num >= 1 && num <= 9) {
        e.preventDefault()
        const targetIndex = num - 1
        if (targetIndex < ws.tabs.length) {
          store.setActiveTab(ws.id, ws.tabs[targetIndex].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
    >
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div
          className="flex flex-1 flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--background)' }}
        >
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

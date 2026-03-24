import { useEffect } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useWorkspaceStore } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useBrowserStore } from './store/browser-store'
import { useTheme } from './hooks/useTheme'
import { useDragAndDrop, DragContext } from './hooks/useDragAndDrop'
import { getActiveFocusedBrowserPane, getSplitShortcutTargetPaneId } from './lib/browser-shortcuts'
import { findWorkspaceIdForPane } from './lib/browser-pane-routing'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SplitLayout from './components/SplitLayout'
import SettingsPage from './components/SettingsPage'
import type { BrowserBridgeListeners, BrowserBridgeUnsubscribe } from '../shared/types'
import { ToastViewport } from './components/ui/toast'
import { FolderClosed } from 'lucide-react'
import { findFolder } from './lib/sidebar-tree'
import type { BrowserConfig } from './types/workspace'

function clampZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom.toFixed(2))))
}

function subscribeToBrowserEvents(listeners: BrowserBridgeListeners): BrowserBridgeUnsubscribe {
  const disposers: BrowserBridgeUnsubscribe[] = []

  if (listeners.onStateChange) {
    disposers.push(window.api.browser.onStateChange(listeners.onStateChange))
  }

  if (listeners.onPermissionRequest) {
    disposers.push(window.api.browser.onPermissionRequest(listeners.onPermissionRequest))
  }

  if (listeners.onOpenInNewTabRequest) {
    disposers.push(window.api.browser.onOpenInNewTabRequest(listeners.onOpenInNewTabRequest))
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}

export default function App(): JSX.Element {
  useTheme()

  const handleRuntimeStateChange = useBrowserStore((s) => s.handleRuntimeStateChange)
  const setPendingPermissionRequest = useBrowserStore((s) => s.setPendingPermissionRequest)
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updateBrowserPaneZoom = useWorkspaceStore((s) => s.updateBrowserPaneZoom)
  const openBrowserTab = useWorkspaceStore((s) => s.openBrowserTab)

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const settingsOpen = useSettingsStore((s) => s.settingsOpen)

  const dnd = useDragAndDrop()
  const { activeDrag } = dnd

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeTab = activeWorkspace?.tabs.find((t) => t.id === activeWorkspace.activeTabId)

  useEffect(() => {
    return subscribeToBrowserEvents({
      onStateChange: (state) => {
        handleRuntimeStateChange(state, {
          persistUrlChange: (paneId, url) => {
            updatePaneConfig(paneId, { url })
          },
          persistCommittedNavigation: state.isLoading === false,
          persistZoomChange: (paneId, zoom) => {
            updateBrowserPaneZoom(paneId, zoom)
          },
        })
      },
      onPermissionRequest: setPendingPermissionRequest,
      onOpenInNewTabRequest: (request) => {
        const state = useWorkspaceStore.getState()
        const workspaceId = findWorkspaceIdForPane(state.workspaces, request.paneId)
        if (workspaceId) {
          openBrowserTab(workspaceId, request.url)
        }
      },
    })
  }, [handleRuntimeStateChange, openBrowserTab, setPendingPermissionRequest, updateBrowserPaneZoom, updatePaneConfig])

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

      const { key, shiftKey, altKey } = e
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
          const targetPaneId = getSplitShortcutTargetPaneId(tab)
          if (targetPaneId) store.splitPane(ws.id, tab.id, targetPaneId, 'horizontal')
        }
        return
      }
      if (key === 'd' && shiftKey) {
        e.preventDefault()
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        if (tab) {
          const targetPaneId = getSplitShortcutTargetPaneId(tab)
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
        return
      }

      const browserPane = getActiveFocusedBrowserPane(store)
      if (!browserPane) {
        return
      }

      const paneId = browserPane.id
      const browserStore = useBrowserStore.getState()
      const browserConfig = browserPane.config as BrowserConfig
      const currentZoom = useBrowserStore.getState().runtimeByPaneId[paneId]?.currentZoom ?? browserConfig.zoom ?? 1

      if (key === 'l' && !shiftKey) {
        e.preventDefault()
        browserStore.requestAddressBarFocus(paneId)
        return
      }

      if (key === 'r' && !shiftKey) {
        e.preventDefault()
        void window.api.browser.reload(paneId)
        return
      }

      if (key === '[' && !shiftKey) {
        e.preventDefault()
        void window.api.browser.back(paneId)
        return
      }

      if (key === ']' && !shiftKey) {
        e.preventDefault()
        void window.api.browser.forward(paneId)
        return
      }

      if (key === 'f' && !shiftKey) {
        e.preventDefault()
        browserStore.requestFindBarFocus(paneId)
        return
      }

      if ((key === 'i' || key === 'I') && altKey) {
        e.preventDefault()
        void window.api.browser.toggleDevTools(paneId)
        return
      }

      if (key === '=' || key === '+') {
        e.preventDefault()
        void window.api.browser.setZoom(paneId, clampZoom(currentZoom + 0.1))
        return
      }

      if (key === '-') {
        e.preventDefault()
        void window.api.browser.setZoom(paneId, clampZoom(currentZoom - 0.1))
        return
      }

      if (key === '0') {
        e.preventDefault()
        void window.api.browser.resetZoom(paneId)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Layout: sidebar on left, main area on right. No separate title bar.
  // The sidebar header and tab bar both act as the window chrome.
  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={dnd.onDragStart}
      onDragOver={dnd.onDragOver}
      onDragEnd={dnd.onDragEnd}
      onDragCancel={dnd.onDragCancel}
    >
      <DragContext.Provider value={activeDrag}>
        <div className="app-shell" data-dragging={activeDrag ? 'true' : undefined}>
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

        <DragOverlay dropAnimation={null}>
          {activeDrag?.type === 'sidebar-workspace' && (() => {
            const ws = workspaces.find((w) => w.id === activeDrag.workspaceId)
            return ws ? (
              <div className="drag-overlay-workspace">{ws.name}</div>
            ) : null
          })()}
          {activeDrag?.type === 'sidebar-folder' && (() => {
            const sidebarTree = useWorkspaceStore.getState().sidebarTree
            const folder = findFolder(sidebarTree, activeDrag.folderId)
            return (
              <div className="drag-overlay-folder">
                <FolderClosed size={12} />
                <span>{folder?.name ?? 'Folder'}</span>
              </div>
            )
          })()}
          {activeDrag?.type === 'tab' && (() => {
            const ws = workspaces.find((w) => w.id === activeDrag.workspaceId)
            const tab = ws?.tabs.find((t) => t.id === activeDrag.tabId)
            return tab ? (
              <div className="drag-overlay-tab">{tab.name}</div>
            ) : null
          })()}
        </DragOverlay>
      </DragContext.Provider>
    </DndContext>
  )
}

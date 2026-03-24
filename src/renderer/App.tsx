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
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest)
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

  // When a full-screen overlay (settings, dialog) is active, native views
  // must be hidden so the DOM overlay is visible.  Also resign first
  // responder from any terminal so keyboard events flow to the DOM.
  const overlayActive = settingsOpen
  useEffect(() => {
    if (overlayActive) {
      void window.api.terminal.blur()
    }
  }, [overlayActive])

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
      onPermissionRequest: (request) => {
        const replacedRequestToken = setPendingPermissionRequest(request)
        if (replacedRequestToken) {
          void window.api.browser.resolvePermission(replacedRequestToken, 'deny')
        }
      },
      onOpenInNewTabRequest: (request) => {
        const state = useWorkspaceStore.getState()
        const workspaceId = findWorkspaceIdForPane(state.workspaces, request.paneId)
        if (workspaceId) {
          openBrowserTab(workspaceId, request.url)
        }
      },
    })
  }, [clearPendingPermissionRequest, handleRuntimeStateChange, openBrowserTab, setPendingPermissionRequest, updateBrowserPaneZoom, updatePaneConfig])

  // Shared action handlers — called by both DOM keydown (when web content
  // has focus) and IPC menu accelerators (when a native view has focus).
  useEffect(() => {
    function doSplitRight(): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
      if (tab) {
        const targetPaneId = getSplitShortcutTargetPaneId(tab)
        if (targetPaneId) store.splitPane(ws.id, tab.id, targetPaneId, 'horizontal')
      }
    }

    function doSplitDown(): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
      if (tab) {
        const targetPaneId = getSplitShortcutTargetPaneId(tab)
        if (targetPaneId) store.splitPane(ws.id, tab.id, targetPaneId, 'vertical')
      }
    }

    function doSwitchTab(num: number): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      const targetIndex = num - 1
      if (targetIndex < ws.tabs.length) {
        store.setActiveTab(ws.id, ws.tabs[targetIndex].id)
      }
    }

    function getBrowserContext(): { paneId: string; currentZoom: number } | null {
      const store = useWorkspaceStore.getState()
      const browserPane = getActiveFocusedBrowserPane(store)
      if (!browserPane) return null
      const browserConfig = browserPane.config as BrowserConfig
      const currentZoom = useBrowserStore.getState().runtimeByPaneId[browserPane.id]?.currentZoom ?? browserConfig.zoom ?? 1
      return { paneId: browserPane.id, currentZoom }
    }

    // Menu accelerator IPC listener — handles shortcuts when native views have focus
    const disposeIpc = window.api.app.onAction((channel, ...args) => {
      const store = useWorkspaceStore.getState()
      const settings = useSettingsStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws && channel !== 'app:toggle-settings') return

      switch (channel) {
        case 'app:new-tab': if (ws) store.addTab(ws.id); break
        case 'app:close-tab': if (ws) store.removeTab(ws.id, ws.activeTabId); break
        case 'app:new-workspace': store.addWorkspace(); break
        case 'app:toggle-sidebar': settings.toggleSidebar(); break
        case 'app:toggle-settings': settings.toggleSettings(); break
        case 'app:split-right': doSplitRight(); break
        case 'app:split-down': doSplitDown(); break
        case 'app:switch-tab': {
          const num = typeof args[0] === 'number' ? args[0] : parseInt(String(args[0]), 10)
          if (num >= 1 && num <= 9) doSwitchTab(num)
          break
        }
        case 'app:browser-focus-url': {
          const ctx = getBrowserContext()
          if (ctx) useBrowserStore.getState().requestAddressBarFocus(ctx.paneId)
          break
        }
        case 'app:browser-reload': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.reload(ctx.paneId)
          break
        }
        case 'app:browser-back': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.back(ctx.paneId)
          break
        }
        case 'app:browser-forward': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.forward(ctx.paneId)
          break
        }
        case 'app:browser-find': {
          const ctx = getBrowserContext()
          if (ctx) useBrowserStore.getState().requestFindBarFocus(ctx.paneId)
          break
        }
        case 'app:browser-zoom-in': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom + 0.1))
          break
        }
        case 'app:browser-zoom-out': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom - 0.1))
          break
        }
        case 'app:browser-zoom-reset': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.resetZoom(ctx.paneId)
          break
        }
        case 'app:browser-devtools': {
          const ctx = getBrowserContext()
          if (ctx) void window.api.browser.toggleDevTools(ctx.paneId)
          break
        }
      }
    })

    // DOM keydown handler — handles shortcuts when web content has focus.
    // The Menu accelerators also fire in this case, but the keydown handler
    // prevents default to stop double-firing for things like Escape and
    // Ctrl+1-9 which are NOT in the menu.
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

      // Ctrl+1-9 for workspace switching (not Cmd — not in menu)
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
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      disposeIpc()
    }
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
                        overlayActive={overlayActive}
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

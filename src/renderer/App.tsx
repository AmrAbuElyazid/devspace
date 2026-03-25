import { useEffect } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useWorkspaceStore, collectGroupIds } from './store/workspace-store'
import { useSettingsStore } from './store/settings-store'
import { useBrowserStore } from './store/browser-store'
import { useTheme } from './hooks/useTheme'
import { useDragAndDrop, DragContext } from './hooks/useDragAndDrop'
import { getActiveFocusedBrowserPane, getSplitShortcutTargetGroupId } from './lib/browser-shortcuts'
import { findWorkspaceIdForPane } from './lib/browser-pane-routing'
import Sidebar from './components/Sidebar'
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
  const openBrowserInGroup = useWorkspaceStore((s) => s.openBrowserInGroup)

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const settingsOpen = useSettingsStore((s) => s.settingsOpen)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)
  const keepVscodeServerRunning = useSettingsStore((s) => s.keepVscodeServerRunning)

  const dnd = useDragAndDrop()
  const { activeDrag, dropIntent } = dnd

  // Sync keepVscodeServerRunning to main process on mount and change.
  useEffect(() => {
    window.api?.editor?.setKeepServerRunning(keepVscodeServerRunning)
  }, [keepVscodeServerRunning])

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
    window.api.window.setSidebarOpen(sidebarOpen)
  }, [sidebarOpen])

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
        const workspaceId = findWorkspaceIdForPane(state.workspaces, request.paneId, state.paneGroups)
        if (workspaceId) {
          const ws = state.workspaces.find((w) => w.id === workspaceId)
          const groupId = ws?.focusedGroupId ?? (ws ? collectGroupIds(ws.root)[0] : null)
          if (groupId) {
            openBrowserInGroup(workspaceId, groupId, request.url)
          }
        }
      },
    })
  }, [clearPendingPermissionRequest, handleRuntimeStateChange, openBrowserInGroup, setPendingPermissionRequest, updateBrowserPaneZoom, updatePaneConfig])

  // Shared action handlers — called by both DOM keydown (when web content
  // has focus) and IPC menu accelerators (when a native view has focus).
  useEffect(() => {
    function doSplitRight(): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      const targetGroupId = getSplitShortcutTargetGroupId(ws)
      if (targetGroupId) store.splitGroup(ws.id, targetGroupId, 'horizontal')
    }

    function doSplitDown(): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      const targetGroupId = getSplitShortcutTargetGroupId(ws)
      if (targetGroupId) store.splitGroup(ws.id, targetGroupId, 'vertical')
    }

    function doSwitchTab(num: number): void {
      const store = useWorkspaceStore.getState()
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId)
      if (!ws) return
      // Switch the nth tab in the focused group
      const groupId = ws.focusedGroupId ?? collectGroupIds(ws.root)[0]
      if (!groupId) return
      const group = store.paneGroups[groupId]
      if (!group) return
      const targetIndex = num - 1
      if (targetIndex < group.tabs.length) {
        store.setActiveGroupTab(ws.id, groupId, group.tabs[targetIndex].id)
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
        case 'app:new-tab': {
          if (!ws) break
          const focusedGid = ws.focusedGroupId ?? collectGroupIds(ws.root)[0]
          if (focusedGid) store.addGroupTab(ws.id, focusedGid)
          break
        }
        case 'app:close-tab': {
          if (!ws) break
          const focusedGid2 = ws.focusedGroupId ?? collectGroupIds(ws.root)[0]
          if (!focusedGid2) break
          const focusedGroup = store.paneGroups[focusedGid2]
          if (focusedGroup) store.removeGroupTab(ws.id, focusedGid2, focusedGroup.activeTabId)
          break
        }
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
      onDragMove={dnd.onDragMove}
      onDragOver={dnd.onDragOver}
      onDragEnd={dnd.onDragEnd}
      onDragCancel={dnd.onDragCancel}
    >
      <DragContext.Provider value={{ activeDrag, dropIntent }}>
        <div className="app-shell" data-dragging={activeDrag ? 'true' : undefined}>
          <Sidebar />
          <div className="app-main">
            <div className="app-content">
              {/* Render ALL workspaces stacked. Only the active workspace is visible.
                  Using visibility:hidden instead of display:none so native views
                  (xterm, WebContentsView) keep their canvas dimensions. */}
              {workspaces.map((ws) => {
                const isVisible = ws.id === activeWorkspaceId
                return (
                  <div
                    key={ws.id}
                    className="app-workspace-layer"
                    data-active={isVisible || undefined}
                  >
                    <SplitLayout
                      node={ws.root}
                      workspaceId={ws.id}
                      overlayActive={overlayActive}
                      sidebarOpen={sidebarOpen}
                      dndEnabled={isVisible}
                    />
                  </div>
                )
              })}

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
          {activeDrag?.type === 'group-tab' && (() => {
            const state = useWorkspaceStore.getState()
            const group = state.paneGroups[activeDrag.groupId]
            const tab = group?.tabs.find((t) => t.id === activeDrag.tabId)
            const pane = tab ? state.panes[tab.paneId] : null
            return pane ? (
              <div className="drag-overlay-tab">{pane.title}</div>
            ) : null
          })()}
        </DragOverlay>
      </DragContext.Provider>
    </DndContext>
  )
}

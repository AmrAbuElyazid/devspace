import { createContext, useContext, useEffect, useMemo } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useWorkspaceStore, collectGroupIds } from "./store/workspace-store";
import { useSettingsStore } from "./store/settings-store";
import { useBrowserStore } from "./store/browser-store";
import { useTheme } from "./hooks/useTheme";
import { useDragAndDrop, DragContext } from "./hooks/useDragAndDrop";
import { useModifierHeld, type HeldModifier } from "./hooks/useModifierHeld";
import {
  getActiveFocusedBrowserPane,
  getSplitShortcutTargetGroupId,
} from "./lib/browser-shortcuts";
import { findWorkspaceIdForPane } from "./lib/browser-pane-routing";
import Sidebar from "./components/Sidebar";
import SplitLayout from "./components/SplitLayout";
import SettingsPage from "./components/SettingsPage";
import type { BrowserBridgeListeners, BrowserBridgeUnsubscribe } from "../shared/types";
import { ToastViewport } from "./components/ui/toast";
import { FolderClosed } from "lucide-react";
import { findFolder } from "./lib/sidebar-tree";
import type { BrowserConfig } from "./types/workspace";

/** Context for which modifier key is currently held (for shortcut hint badges). */
const ModifierHeldContext = createContext<HeldModifier>(null);
export function useModifierHeldContext(): HeldModifier {
  return useContext(ModifierHeldContext);
}

function clampZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom.toFixed(2))));
}

function subscribeToBrowserEvents(listeners: BrowserBridgeListeners): BrowserBridgeUnsubscribe {
  const disposers: BrowserBridgeUnsubscribe[] = [];

  if (listeners.onStateChange) {
    disposers.push(window.api.browser.onStateChange(listeners.onStateChange));
  }

  if (listeners.onPermissionRequest) {
    disposers.push(window.api.browser.onPermissionRequest(listeners.onPermissionRequest));
  }

  if (listeners.onOpenInNewTabRequest) {
    disposers.push(window.api.browser.onOpenInNewTabRequest(listeners.onOpenInNewTabRequest));
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}

export default function App() {
  useTheme();

  const handleRuntimeStateChange = useBrowserStore((s) => s.handleRuntimeStateChange);
  const setPendingPermissionRequest = useBrowserStore((s) => s.setPendingPermissionRequest);
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updateBrowserPaneZoom = useWorkspaceStore((s) => s.updateBrowserPaneZoom);
  const openBrowserInGroup = useWorkspaceStore((s) => s.openBrowserInGroup);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const keepVscodeServerRunning = useSettingsStore((s) => s.keepVscodeServerRunning);

  const dnd = useDragAndDrop();
  const { activeDrag, dropIntent } = dnd;
  const dragContextValue = useMemo(() => ({ activeDrag, dropIntent }), [activeDrag, dropIntent]);
  const modifierHeld = useModifierHeld();

  // Sync keepVscodeServerRunning to main process on mount and change.
  useEffect(() => {
    window.api?.editor?.setKeepServerRunning(keepVscodeServerRunning);
  }, [keepVscodeServerRunning]);

  // When a full-screen overlay (settings, dialog) is active, native views
  // must be hidden so the DOM overlay is visible.  Also resign first
  // responder from any terminal so keyboard events flow to the DOM.
  const overlayCount = useSettingsStore((s) => s.overlayCount);
  const overlayActive = settingsOpen || overlayCount > 0;
  useEffect(() => {
    if (overlayActive) {
      void window.api.terminal.blur();
    }
  }, [overlayActive]);

  // Listen for CLI-triggered "open editor" requests from the main process.
  const openEditorTab = useWorkspaceStore((s) => s.openEditorTab);
  useEffect(() => {
    return window.api.window.onOpenEditor((folderPath) => {
      openEditorTab(folderPath);
    });
  }, [openEditorTab]);

  // Re-focus the active terminal when the window regains focus.
  // macOS restores first-responder to the Electron web content view,
  // not to the previously-focused GhosttyView.
  useEffect(() => {
    return window.api.window.onFocus(() => {
      // Don't steal focus from an open overlay (settings, dialog, etc.)
      if (useSettingsStore.getState().settingsOpen || useSettingsStore.getState().overlayCount > 0)
        return;

      const state = useWorkspaceStore.getState();
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (!ws?.focusedGroupId) return;
      const group = state.paneGroups[ws.focusedGroupId];
      if (!group) return;
      const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
      if (!activeTab) return;
      const pane = state.panes[activeTab.paneId];
      if (pane?.type === "terminal") {
        void window.api.terminal.focus(activeTab.paneId);
      }
    });
  }, []);

  // When a native GhosttyView receives focus (user clicks on a terminal pane),
  // update focusedGroupId so keyboard shortcuts operate on the correct group.
  useEffect(() => {
    return window.api.terminal.onFocused((surfaceId) => {
      const state = useWorkspaceStore.getState();
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (!ws) return;

      // Find which group contains a tab with this paneId
      const groupIds = collectGroupIds(ws.root);
      for (const gid of groupIds) {
        const group = state.paneGroups[gid];
        if (group?.tabs.some((t) => t.paneId === surfaceId)) {
          if (ws.focusedGroupId !== gid) {
            state.setFocusedGroup(ws.id, gid);
          }
          return;
        }
      }
    });
  }, []);

  useEffect(() => {
    window.api.window.setSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    return subscribeToBrowserEvents({
      onStateChange: (state) => {
        handleRuntimeStateChange(state, {
          persistUrlChange: (paneId, url) => {
            updatePaneConfig(paneId, { url });
          },
          persistCommittedNavigation: state.isLoading === false,
          persistZoomChange: (paneId, zoom) => {
            updateBrowserPaneZoom(paneId, zoom);
          },
        });
      },
      onPermissionRequest: (request) => {
        const replacedRequestToken = setPendingPermissionRequest(request);
        if (replacedRequestToken) {
          void window.api.browser.resolvePermission(replacedRequestToken, "deny");
        }
      },
      onOpenInNewTabRequest: (request) => {
        const state = useWorkspaceStore.getState();
        const workspaceId = findWorkspaceIdForPane(
          state.workspaces,
          request.paneId,
          state.paneGroups,
        );
        if (workspaceId) {
          const ws = state.workspaces.find((w) => w.id === workspaceId);
          const groupId = ws?.focusedGroupId ?? (ws ? collectGroupIds(ws.root)[0] : null);
          if (groupId) {
            openBrowserInGroup(workspaceId, groupId, request.url);
          }
        }
      },
    });
  }, [
    clearPendingPermissionRequest,
    handleRuntimeStateChange,
    openBrowserInGroup,
    setPendingPermissionRequest,
    updateBrowserPaneZoom,
    updatePaneConfig,
  ]);

  // Shared action handlers — dispatched from both IPC menu accelerators
  // (when a native view has focus) and DOM keydown (when web content has focus).
  // IPC channels map to the shortcut registry's ipcChannel values.
  useEffect(() => {
    function getActiveWorkspace(): {
      store: ReturnType<typeof useWorkspaceStore.getState>;
      ws: ReturnType<typeof useWorkspaceStore.getState>["workspaces"][0];
    } | null {
      const store = useWorkspaceStore.getState();
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId);
      if (!ws) return null;
      return { store, ws };
    }

    function getFocusedGroupId(
      ws: ReturnType<typeof useWorkspaceStore.getState>["workspaces"][0],
    ): string | undefined {
      return ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
    }

    function getBrowserContext(): { paneId: string; currentZoom: number } | null {
      const store = useWorkspaceStore.getState();
      const browserPane = getActiveFocusedBrowserPane(store);
      if (!browserPane) return null;
      const browserConfig = browserPane.config as BrowserConfig;
      const currentZoom =
        useBrowserStore.getState().runtimeByPaneId[browserPane.id]?.currentZoom ??
        browserConfig.zoom ??
        1;
      return { paneId: browserPane.id, currentZoom };
    }

    /** Get the focused terminal pane's surfaceId (for font zoom). */
    function getFocusedTerminalSurfaceId(): string | null {
      const ctx = getActiveWorkspace();
      if (!ctx) return null;
      const groupId = getFocusedGroupId(ctx.ws);
      if (!groupId) return null;
      const group = ctx.store.paneGroups[groupId];
      if (!group) return null;
      const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
      if (!activeTab) return null;
      const pane = ctx.store.panes[activeTab.paneId];
      if (!pane || pane.type !== "terminal") return null;
      return activeTab.paneId; // surfaceId = paneId for terminals
    }

    // Menu accelerator IPC listener — handles all shortcuts from the registry
    const disposeIpc = window.api.app.onAction((channel, ...args) => {
      const settings = useSettingsStore.getState();

      switch (channel) {
        // ── General ──────────────────────────────────────────────────
        case "app:toggle-sidebar":
          settings.toggleSidebar();
          break;
        case "app:toggle-settings":
          settings.toggleSettings();
          break;
        case "app:close-window":
          window.api.window.close();
          break;

        // ── Workspaces ───────────────────────────────────────────────
        case "app:new-workspace":
          useWorkspaceStore.getState().addWorkspace();
          break;
        case "app:close-workspace": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.removeWorkspace(ctx.ws.id);
          break;
        }
        case "app:rename-workspace": {
          const ctx = getActiveWorkspace();
          if (ctx) {
            // Trigger inline rename via the pendingEdit mechanism
            useWorkspaceStore.setState({
              pendingEditId: ctx.ws.id,
              pendingEditType: "workspace",
            });
          }
          break;
        }
        case "app:next-workspace":
          useWorkspaceStore.getState().activateNextWorkspace();
          break;
        case "app:prev-workspace":
          useWorkspaceStore.getState().activatePrevWorkspace();
          break;
        case "app:select-workspace": {
          const num = typeof args[0] === "number" ? args[0] : parseInt(String(args[0]), 10);
          if (num >= 1 && num <= 9) {
            const store = useWorkspaceStore.getState();
            const targetIdx = num === 9 ? store.workspaces.length - 1 : num - 1;
            const targetWs = store.workspaces[targetIdx];
            if (targetWs) store.setActiveWorkspace(targetWs.id);
          }
          break;
        }

        // ── Tabs ─────────────────────────────────────────────────────
        case "app:new-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.addGroupTab(ctx.ws.id, gid, settings.defaultPaneType);
          break;
        }
        case "app:close-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (!gid) break;
          const group = ctx.store.paneGroups[gid];
          if (group) ctx.store.removeGroupTab(ctx.ws.id, gid, group.activeTabId);
          break;
        }
        case "app:next-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.activateNextTab(ctx.ws.id, gid);
          break;
        }
        case "app:prev-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.activatePrevTab(ctx.ws.id, gid);
          break;
        }
        case "app:rename-tab": {
          // Handled by GroupTabBar via a store flag (similar to workspace rename)
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (!gid) break;
          const group = ctx.store.paneGroups[gid];
          if (group) {
            // Set a global rename state that GroupTabBar can pick up
            useWorkspaceStore.setState({
              pendingEditId: group.activeTabId,
              pendingEditType: "tab" as const,
            });
          }
          break;
        }
        case "app:select-tab": {
          const num = typeof args[0] === "number" ? args[0] : parseInt(String(args[0]), 10);
          if (num >= 1 && num <= 9) {
            const ctx = getActiveWorkspace();
            if (!ctx) break;
            const gid = getFocusedGroupId(ctx.ws);
            if (!gid) break;
            const group = ctx.store.paneGroups[gid];
            if (!group) break;
            const targetIndex = num - 1;
            const targetTab = group.tabs[targetIndex];
            if (targetTab) ctx.store.setActiveGroupTab(ctx.ws.id, gid, targetTab.id);
          }
          break;
        }

        // ── Panes ────────────────────────────────────────────────────
        case "app:split-right": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getSplitShortcutTargetGroupId(ctx.ws);
          if (gid) ctx.store.splitGroup(ctx.ws.id, gid, "horizontal");
          break;
        }
        case "app:split-down": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getSplitShortcutTargetGroupId(ctx.ws);
          if (gid) ctx.store.splitGroup(ctx.ws.id, gid, "vertical");
          break;
        }
        case "app:focus-pane-left": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.focusGroupInDirection(ctx.ws.id, "left");
          break;
        }
        case "app:focus-pane-right": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.focusGroupInDirection(ctx.ws.id, "right");
          break;
        }
        case "app:focus-pane-up": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.focusGroupInDirection(ctx.ws.id, "up");
          break;
        }
        case "app:focus-pane-down": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.focusGroupInDirection(ctx.ws.id, "down");
          break;
        }
        case "app:toggle-pane-zoom": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.togglePaneZoom(ctx.ws.id);
          break;
        }

        // ── Context-sensitive zoom ───────────────────────────────────
        // Cmd+=/- dispatches to terminal font zoom or browser zoom
        // depending on the focused pane type.
        case "app:zoom-in": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "increase_font_size:1");
          } else {
            const ctx = getBrowserContext();
            if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom + 0.1));
          }
          break;
        }
        case "app:zoom-out": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "decrease_font_size:1");
          } else {
            const ctx = getBrowserContext();
            if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom - 0.1));
          }
          break;
        }
        case "app:zoom-reset": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "reset_font_size");
          } else {
            const ctx = getBrowserContext();
            if (ctx) void window.api.browser.resetZoom(ctx.paneId);
          }
          break;
        }

        // ── Browser-specific ─────────────────────────────────────────
        case "app:browser-focus-url": {
          const ctx = getBrowserContext();
          if (ctx) useBrowserStore.getState().requestAddressBarFocus(ctx.paneId);
          break;
        }
        case "app:browser-reload": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.reload(ctx.paneId);
          break;
        }
        case "app:browser-back": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.back(ctx.paneId);
          break;
        }
        case "app:browser-forward": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.forward(ctx.paneId);
          break;
        }
        case "app:browser-find": {
          const ctx = getBrowserContext();
          if (ctx) useBrowserStore.getState().requestFindBarFocus(ctx.paneId);
          break;
        }
        case "app:browser-zoom-in": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom + 0.1));
          break;
        }
        case "app:browser-zoom-out": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom - 0.1));
          break;
        }
        case "app:browser-zoom-reset": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.resetZoom(ctx.paneId);
          break;
        }
        case "app:browser-devtools": {
          const ctx = getBrowserContext();
          if (ctx) void window.api.browser.toggleDevTools(ctx.paneId);
          break;
        }
        case "app:open-browser": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.openBrowserInGroup(ctx.ws.id, gid, "https://google.com");
          break;
        }
      }
    });

    // DOM keydown handler — handles shortcuts when web content has focus.
    // Escape is not in the menu, so it needs a DOM handler.
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const settings = useSettingsStore.getState();
        if (settings.settingsOpen) {
          settings.setSettingsOpen(false);
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      disposeIpc();
    };
  }, []);

  // Layout: sidebar on left, main area on right. No separate title bar.
  // The sidebar header and tab bar both act as the window chrome.
  return (
    <ModifierHeldContext.Provider value={modifierHeld}>
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.onDragStart}
        onDragMove={dnd.onDragMove}
        onDragOver={dnd.onDragOver}
        onDragEnd={dnd.onDragEnd}
        onDragCancel={dnd.onDragCancel}
      >
        <DragContext.Provider value={dragContextValue}>
          <div className="app-shell" data-dragging={activeDrag ? "true" : undefined}>
            <Sidebar />
            <div className="app-main">
              <div className="app-content">
                {/* Render ALL workspaces stacked. Only the active workspace is visible.
                  Using visibility:hidden instead of display:none so native views
                  (xterm, WebContentsView) keep their canvas dimensions. */}
                {workspaces.map((ws) => {
                  const isVisible = ws.id === activeWorkspaceId;
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
                  );
                })}

                {/* Settings overlay */}
                {settingsOpen && <SettingsPage />}
              </div>
            </div>
            <ToastViewport />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag?.type === "sidebar-workspace" &&
              (() => {
                const ws = workspaces.find((w) => w.id === activeDrag.workspaceId);
                return ws ? <div className="drag-overlay-workspace">{ws.name}</div> : null;
              })()}
            {activeDrag?.type === "sidebar-folder" &&
              (() => {
                const sidebarTree = useWorkspaceStore.getState().sidebarTree;
                const folder = findFolder(sidebarTree, activeDrag.folderId);
                return (
                  <div className="drag-overlay-folder">
                    <FolderClosed size={12} />
                    <span>{folder?.name ?? "Folder"}</span>
                  </div>
                );
              })()}
            {activeDrag?.type === "group-tab" &&
              (() => {
                const state = useWorkspaceStore.getState();
                const group = state.paneGroups[activeDrag.groupId];
                const tab = group?.tabs.find((t) => t.id === activeDrag.tabId);
                const pane = tab ? state.panes[tab.paneId] : null;
                return pane ? <div className="drag-overlay-tab">{pane.title}</div> : null;
              })()}
          </DragOverlay>
        </DragContext.Provider>
      </DndContext>
    </ModifierHeldContext.Provider>
  );
}

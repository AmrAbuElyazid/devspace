import { useEffect } from "react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";
import { useBrowserStore } from "../store/browser-store";
import { useTerminalStore } from "../store/terminal-store";
import {
  getActiveFocusedBrowserPane,
  getActiveFocusedWebViewPane,
  getSplitShortcutTargetGroupId,
} from "../lib/browser-shortcuts";
import { focusActiveNativePane } from "../lib/native-pane-focus";

function clampZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom.toFixed(2))));
}

/**
 * Registers all IPC shortcut handlers (menu accelerators) and the DOM
 * Escape keydown handler.
 *
 * Extracted from App.tsx to keep the root component focused on layout.
 */
export function useAppShortcuts(): void {
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
      const currentZoom =
        useBrowserStore.getState().runtimeByPaneId[browserPane.id]?.currentZoom ??
        browserPane.config.zoom ??
        1;
      return { paneId: browserPane.id, currentZoom };
    }

    function getWebViewContext(): { paneId: string; currentZoom: number } | null {
      const store = useWorkspaceStore.getState();
      const pane = getActiveFocusedWebViewPane(store);
      if (!pane) return null;
      const currentZoom =
        useBrowserStore.getState().runtimeByPaneId[pane.id]?.currentZoom ??
        (pane.type === "browser" ? pane.config.zoom : undefined) ??
        1;
      return { paneId: pane.id, currentZoom };
    }

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
      return activeTab.paneId;
    }

    const disposeIpc = window.api.app.onAction((channel, ...args) => {
      const settings = useSettingsStore.getState();

      if (
        settings.settingsOpen &&
        channel !== "app:toggle-settings" &&
        channel !== "app:close-window"
      ) {
        settings.setSettingsOpen(false);
      }

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
          if (settings.defaultPaneType === "picker") {
            settings.openPanePicker({ action: "new-workspace", container: "main" });
          } else {
            useWorkspaceStore
              .getState()
              .addWorkspace(undefined, null, "main", settings.defaultPaneType);
          }
          break;
        case "app:close-workspace": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.removeWorkspace(ctx.ws.id);
          break;
        }
        case "app:rename-workspace": {
          const ctx = getActiveWorkspace();
          if (ctx) {
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
          if (!gid) break;
          if (settings.defaultPaneType === "picker") {
            settings.openPanePicker({ action: "new-tab", workspaceId: ctx.ws.id, groupId: gid });
          } else {
            ctx.store.addGroupTab(ctx.ws.id, gid, settings.defaultPaneType);
          }
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
        case "app:recent-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.activateRecentTab(ctx.ws.id, gid, 1);
          break;
        }
        case "app:recent-tab-reverse": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (gid) ctx.store.activateRecentTab(ctx.ws.id, gid, -1);
          break;
        }
        case "app:rename-tab": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getFocusedGroupId(ctx.ws);
          if (!gid) break;
          const group = ctx.store.paneGroups[gid];
          if (group) {
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
          if (gid) {
            settings.openPanePicker({
              action: "split",
              workspaceId: ctx.ws.id,
              groupId: gid,
              splitDirection: "horizontal",
            });
          }
          break;
        }
        case "app:split-down": {
          const ctx = getActiveWorkspace();
          if (!ctx) break;
          const gid = getSplitShortcutTargetGroupId(ctx.ws);
          if (gid) {
            settings.openPanePicker({
              action: "split",
              workspaceId: ctx.ws.id,
              groupId: gid,
              splitDirection: "vertical",
            });
          }
          break;
        }
        case "app:focus-pane-left": {
          const ctx = getActiveWorkspace();
          if (ctx) {
            const previousGroupId = getFocusedGroupId(ctx.ws);
            ctx.store.focusGroupInDirection(ctx.ws.id, "left");
            const nextWorkspace = useWorkspaceStore
              .getState()
              .workspaces.find((workspace) => workspace.id === ctx.ws.id);
            if (nextWorkspace && getFocusedGroupId(nextWorkspace) !== previousGroupId) {
              focusActiveNativePane();
            }
          }
          break;
        }
        case "app:focus-pane-right": {
          const ctx = getActiveWorkspace();
          if (ctx) {
            const previousGroupId = getFocusedGroupId(ctx.ws);
            ctx.store.focusGroupInDirection(ctx.ws.id, "right");
            const nextWorkspace = useWorkspaceStore
              .getState()
              .workspaces.find((workspace) => workspace.id === ctx.ws.id);
            if (nextWorkspace && getFocusedGroupId(nextWorkspace) !== previousGroupId) {
              focusActiveNativePane();
            }
          }
          break;
        }
        case "app:focus-pane-up": {
          const ctx = getActiveWorkspace();
          if (ctx) {
            const previousGroupId = getFocusedGroupId(ctx.ws);
            ctx.store.focusGroupInDirection(ctx.ws.id, "up");
            const nextWorkspace = useWorkspaceStore
              .getState()
              .workspaces.find((workspace) => workspace.id === ctx.ws.id);
            if (nextWorkspace && getFocusedGroupId(nextWorkspace) !== previousGroupId) {
              focusActiveNativePane();
            }
          }
          break;
        }
        case "app:focus-pane-down": {
          const ctx = getActiveWorkspace();
          if (ctx) {
            const previousGroupId = getFocusedGroupId(ctx.ws);
            ctx.store.focusGroupInDirection(ctx.ws.id, "down");
            const nextWorkspace = useWorkspaceStore
              .getState()
              .workspaces.find((workspace) => workspace.id === ctx.ws.id);
            if (nextWorkspace && getFocusedGroupId(nextWorkspace) !== previousGroupId) {
              focusActiveNativePane();
            }
          }
          break;
        }
        case "app:toggle-pane-zoom": {
          const ctx = getActiveWorkspace();
          if (ctx) ctx.store.togglePaneZoom(ctx.ws.id);
          break;
        }

        // ── Context-sensitive zoom ───────────────────────────────────
        case "app:zoom-in": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "increase_font_size:1");
          } else {
            const ctx = getWebViewContext();
            if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom + 0.1));
          }
          break;
        }
        case "app:zoom-out": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "decrease_font_size:1");
          } else {
            const ctx = getWebViewContext();
            if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom - 0.1));
          }
          break;
        }
        case "app:zoom-reset": {
          const termId = getFocusedTerminalSurfaceId();
          if (termId) {
            void window.api.terminal.sendBindingAction(termId, "reset_font_size");
          } else {
            const ctx = getWebViewContext();
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
          // Context-aware Cmd+F: browser find if a browser pane is focused,
          // terminal search if a terminal pane is focused.
          const ctx = getBrowserContext();
          if (ctx) {
            useBrowserStore.getState().requestFindBarFocus(ctx.paneId);
          } else {
            const surfaceId = getFocusedTerminalSurfaceId();
            if (surfaceId) useTerminalStore.getState().requestFindBarFocus(surfaceId);
          }
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

    // DOM keydown handler -- Escape is not in the menu, so it needs a DOM handler.
    // Note: pane picker dialog handles its own Escape via a capture-phase
    // window listener, so we only need to handle settings here.
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
}

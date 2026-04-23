import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";
import { useBrowserStore } from "../store/browser-store";
import { useTerminalStore } from "../store/terminal-store";
import {
  getActiveFocusedBrowserPane,
  getActiveFocusedWebViewPane,
  getSplitShortcutTargetGroupId,
} from "../lib/browser-shortcuts";
import {
  focusActiveNativePane,
  getFocusedActiveNativePane,
  releaseNativeFocus,
} from "../lib/native-pane-focus";
import { useNativeViewStore } from "../store/native-view-store";

let leaderCapturePaneId: string | null = null;
let leaderCaptureRestoreTimer: number | null = null;

function isLeaderCaptureActive(): boolean {
  return leaderCapturePaneId !== null;
}

function clearLeaderCaptureRestoreTimer(): void {
  if (leaderCaptureRestoreTimer === null) {
    return;
  }

  window.clearTimeout(leaderCaptureRestoreTimer);
  leaderCaptureRestoreTimer = null;
}

function endLeaderCapture(refocusNativePane: boolean): void {
  if (!isLeaderCaptureActive()) {
    return;
  }

  clearLeaderCaptureRestoreTimer();
  leaderCapturePaneId = null;
  useNativeViewStore.getState().setTemporarilyHiddenPaneId(null);
  if (refocusNativePane) {
    queueMicrotask(() => {
      focusActiveNativePane();
    });
  }
}

function activateLeaderCapture(): void {
  if (useSettingsStore.getState().isOverlayActive()) {
    return;
  }

  const pane = getFocusedActiveNativePane();
  if (!pane) {
    return;
  }

  leaderCapturePaneId = pane.id;
  useNativeViewStore.getState().setTemporarilyHiddenPaneId(pane.id);
  releaseNativeFocus();
}

function toggleLeaderCapture(): void {
  if (isLeaderCaptureActive()) {
    endLeaderCapture(true);
    return;
  }

  activateLeaderCapture();
}

function scheduleLeaderCaptureRestore(): void {
  if (!isLeaderCaptureActive() || leaderCaptureRestoreTimer !== null) {
    return;
  }

  leaderCaptureRestoreTimer = window.setTimeout(() => {
    leaderCaptureRestoreTimer = null;
    endLeaderCapture(true);
  }, 0);
}

export function resetAppShortcutCaptureState(): void {
  clearLeaderCaptureRestoreTimer();
  leaderCapturePaneId = null;
  useNativeViewStore.getState().setTemporarilyHiddenPaneId(null);
}

function clampZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom.toFixed(2))));
}

type WorkspaceStore = ReturnType<typeof useWorkspaceStore.getState>;
type WorkspaceRecord = WorkspaceStore["workspaces"][0];

function getActiveWorkspace(): { store: WorkspaceStore; ws: WorkspaceRecord } | null {
  const store = useWorkspaceStore.getState();
  const ws = store.workspaces.find((workspace) => workspace.id === store.activeWorkspaceId);
  if (!ws) return null;
  return { store, ws };
}

function getFocusedGroupId(ws: WorkspaceRecord): string | undefined {
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
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);
  if (!activeTab) return null;
  const pane = ctx.store.panes[activeTab.paneId];
  if (!pane || pane.type !== "terminal") return null;
  return activeTab.paneId;
}

function focusPaneInDirection(direction: "left" | "right" | "up" | "down"): void {
  const ctx = getActiveWorkspace();
  if (!ctx) return;

  const previousGroupId = getFocusedGroupId(ctx.ws);
  ctx.store.focusGroupInDirection(ctx.ws.id, direction);
  const nextWorkspace = useWorkspaceStore
    .getState()
    .workspaces.find((workspace) => workspace.id === ctx.ws.id);
  if (nextWorkspace && getFocusedGroupId(nextWorkspace) !== previousGroupId) {
    focusActiveNativePane();
  }
}

function closeSettingsIfNeeded(channel: string): void {
  const settings = useSettingsStore.getState();
  if (
    settings.settingsOpen &&
    channel !== "app:toggle-settings" &&
    channel !== "app:leader" &&
    channel !== "app:close-window"
  ) {
    settings.setSettingsOpen(false);
  }
}

function dispatchShortcutAction(channel: string, ...args: unknown[]): void {
  const settings = useSettingsStore.getState();

  closeSettingsIfNeeded(channel);

  switch (channel) {
    case "app:leader":
      toggleLeaderCapture();
      break;
    case "app:toggle-sidebar":
      settings.toggleSidebar();
      break;
    case "app:toggle-settings":
      settings.toggleSettings();
      break;
    case "app:close-window":
      window.api.window.close();
      break;

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

    case "app:new-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (!groupId) break;
      if (settings.defaultPaneType === "picker") {
        settings.openPanePicker({ action: "new-tab", workspaceId: ctx.ws.id, groupId });
      } else {
        ctx.store.addGroupTab(ctx.ws.id, groupId, settings.defaultPaneType);
      }
      break;
    }
    case "app:close-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (!groupId) break;
      const group = ctx.store.paneGroups[groupId];
      if (group) ctx.store.removeGroupTab(ctx.ws.id, groupId, group.activeTabId);
      break;
    }
    case "app:next-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (groupId) ctx.store.activateNextTab(ctx.ws.id, groupId);
      break;
    }
    case "app:prev-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (groupId) ctx.store.activatePrevTab(ctx.ws.id, groupId);
      break;
    }
    case "app:recent-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (groupId) ctx.store.activateRecentTab(ctx.ws.id, groupId, 1);
      break;
    }
    case "app:recent-tab-reverse": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (groupId) ctx.store.activateRecentTab(ctx.ws.id, groupId, -1);
      break;
    }
    case "app:rename-tab": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getFocusedGroupId(ctx.ws);
      if (!groupId) break;
      const group = ctx.store.paneGroups[groupId];
      if (group) {
        useWorkspaceStore.setState({
          pendingEditId: group.activeTabId,
          pendingEditType: "tab",
        });
      }
      break;
    }
    case "app:select-tab": {
      const num = typeof args[0] === "number" ? args[0] : parseInt(String(args[0]), 10);
      if (num >= 1 && num <= 9) {
        const ctx = getActiveWorkspace();
        if (!ctx) break;
        const groupId = getFocusedGroupId(ctx.ws);
        if (!groupId) break;
        const group = ctx.store.paneGroups[groupId];
        if (!group) break;
        const targetTab = group.tabs[num - 1];
        if (targetTab) ctx.store.setActiveGroupTab(ctx.ws.id, groupId, targetTab.id);
      }
      break;
    }

    case "app:split-right": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getSplitShortcutTargetGroupId(ctx.ws);
      if (groupId) {
        settings.openPanePicker({
          action: "split",
          workspaceId: ctx.ws.id,
          groupId,
          splitDirection: "horizontal",
        });
      }
      break;
    }
    case "app:split-down": {
      const ctx = getActiveWorkspace();
      if (!ctx) break;
      const groupId = getSplitShortcutTargetGroupId(ctx.ws);
      if (groupId) {
        settings.openPanePicker({
          action: "split",
          workspaceId: ctx.ws.id,
          groupId,
          splitDirection: "vertical",
        });
      }
      break;
    }
    case "app:focus-pane-left":
      focusPaneInDirection("left");
      break;
    case "app:focus-pane-right":
      focusPaneInDirection("right");
      break;
    case "app:focus-pane-up":
      focusPaneInDirection("up");
      break;
    case "app:focus-pane-down":
      focusPaneInDirection("down");
      break;
    case "app:toggle-pane-zoom": {
      const ctx = getActiveWorkspace();
      if (ctx) ctx.store.togglePaneZoom(ctx.ws.id);
      break;
    }

    case "app:zoom-in": {
      const terminalId = getFocusedTerminalSurfaceId();
      if (terminalId) {
        void window.api.terminal.sendBindingAction(terminalId, "increase_font_size:1");
      } else {
        const ctx = getWebViewContext();
        if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom + 0.1));
      }
      break;
    }
    case "app:zoom-out": {
      const terminalId = getFocusedTerminalSurfaceId();
      if (terminalId) {
        void window.api.terminal.sendBindingAction(terminalId, "decrease_font_size:1");
      } else {
        const ctx = getWebViewContext();
        if (ctx) void window.api.browser.setZoom(ctx.paneId, clampZoom(ctx.currentZoom - 0.1));
      }
      break;
    }
    case "app:zoom-reset": {
      const terminalId = getFocusedTerminalSurfaceId();
      if (terminalId) {
        void window.api.terminal.sendBindingAction(terminalId, "reset_font_size");
      } else {
        const ctx = getWebViewContext();
        if (ctx) void window.api.browser.resetZoom(ctx.paneId);
      }
      break;
    }

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
      const groupId = getFocusedGroupId(ctx.ws);
      if (groupId) ctx.store.openBrowserInGroup(ctx.ws.id, groupId, "https://google.com");
      break;
    }
  }
}

export function dispatchAppShortcutAction(channel: string, ...args: unknown[]): void {
  if (channel !== "app:leader" && isLeaderCaptureActive()) {
    endLeaderCapture(false);
    dispatchShortcutAction(channel, ...args);
    queueMicrotask(() => {
      focusActiveNativePane();
    });
    return;
  }

  dispatchShortcutAction(channel, ...args);
}

export function handleAppShortcutKeyDown(event: KeyboardEvent): void {
  if (isLeaderCaptureActive()) {
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      return;
    }

    if (event.key === "Escape") {
      endLeaderCapture(true);
      event.preventDefault();
      return;
    }

    scheduleLeaderCaptureRestore();
    return;
  }

  if (event.key !== "Escape") {
    return;
  }

  const settings = useSettingsStore.getState();
  if (!settings.settingsOpen) {
    return;
  }

  settings.setSettingsOpen(false);
  event.preventDefault();
}

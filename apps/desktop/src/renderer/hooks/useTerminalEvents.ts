import { useEffect } from "react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";
import { useTerminalStore } from "../store/terminal-store";

/**
 * Manages terminal-related IPC event subscriptions:
 * - CWD change tracking (for new-tab directory inheritance)
 * - Focus tracking (sync focusedGroupId when native terminal view is clicked)
 * - Window focus restoration (re-focus terminal after window regains focus)
 */
export function useTerminalEvents(): void {
  // Track CWD changes from terminals so new tabs can inherit the directory.
  useEffect(() => {
    return window.api.terminal.onPwdChanged((surfaceId, pwd) => {
      const state = useWorkspaceStore.getState();
      const pane = state.panes[surfaceId];
      if (pane?.type === "terminal") {
        state.updatePaneConfig(surfaceId, { cwd: pwd });
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

  // Re-focus the active terminal when the window regains focus.
  // macOS restores first-responder to the Electron web content view,
  // not to the previously-focused GhosttyView.
  useEffect(() => {
    return window.api.window.onFocus(() => {
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

  // Search callbacks: Ghostty reports match counts back through the action callback pipeline.
  useEffect(() => {
    return window.api.terminal.onSearchStart((surfaceId) => {
      useTerminalStore.getState().requestFindBarFocus(surfaceId);
    });
  }, []);

  useEffect(() => {
    return window.api.terminal.onSearchEnd((surfaceId) => {
      useTerminalStore.getState().closeFindBar(surfaceId);
      useTerminalStore.getState().clearSearchState(surfaceId);
    });
  }, []);

  useEffect(() => {
    return window.api.terminal.onSearchTotal((surfaceId, total) => {
      useTerminalStore.getState().updateSearchTotal(surfaceId, total);
    });
  }, []);

  useEffect(() => {
    return window.api.terminal.onSearchSelected((surfaceId, selected) => {
      useTerminalStore.getState().updateSearchSelected(surfaceId, selected);
    });
  }, []);
}

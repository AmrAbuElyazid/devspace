import { useEffect } from "react";
import { useWorkspaceStore } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";
import { useTerminalStore } from "../store/terminal-store";
import { markTerminalSurfaceDestroyed } from "../lib/terminal-surface-session";
import { focusActiveNativePane, syncWorkspaceFocusForPane } from "../lib/native-pane-focus";

/**
 * Manages terminal-related IPC event subscriptions:
 * - CWD change tracking (for new-tab directory inheritance)
 * - Focus tracking (sync workspace, group, and active tab when a native terminal is clicked)
 * - Window focus restoration (re-focus terminal after window regains focus)
 */
export function useTerminalEvents(): void {
  useEffect(() => {
    return window.api.terminal.onTitleChanged((surfaceId, title) => {
      const state = useWorkspaceStore.getState();
      const pane = state.panes[surfaceId];
      if (pane?.type === "terminal" && pane.title !== title) {
        state.updatePaneTitle(surfaceId, title);
      }
    });
  }, []);

  useEffect(() => {
    return window.api.terminal.onClosed((surfaceId) => {
      markTerminalSurfaceDestroyed(surfaceId);
      const terminalState = useTerminalStore.getState();
      terminalState.closeFindBar(surfaceId);
      terminalState.clearSearchState(surfaceId);
    });
  }, []);

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

  // When a native GhosttyView receives focus (or is clicked while already
  // focused), activate the owning pane so tab/group state stays aligned with
  // the native first responder.
  useEffect(() => {
    return window.api.terminal.onFocused((surfaceId) => {
      syncWorkspaceFocusForPane(surfaceId);
    });
  }, []);

  // Re-focus the active native pane when the window regains focus.
  useEffect(() => {
    return window.api.window.onFocus(() => {
      if (useSettingsStore.getState().settingsOpen || useSettingsStore.getState().overlayCount > 0)
        return;

      focusActiveNativePane();
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

import { collectGroupIds, useWorkspaceStore } from "../store/workspace-store";
import { useBrowserStore } from "../store/browser-store";
import {
  isNativePaneOnScreen,
  recordNativeFocusRequest,
  useNativeViewStore,
} from "../store/native-view-store";
import { useSettingsStore } from "../store/settings-store";
import { useTerminalStore } from "../store/terminal-store";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

interface ActivePaneContext {
  workspace: Workspace;
  group: PaneGroup;
  pane: Pane;
}

/**
 * How many renderer fields are currently insisting on the keyboard.
 *
 * `hasEditableRendererFocus()` reads `document.activeElement`, which is both
 * too late and not the truth. Too late because a field is only the active
 * element a frame after it mounts, and a `window:focus` arriving in that gap —
 * closing the context menu that started a rename does exactly that — hands the
 * keyboard to the pane behind it. Not the truth because the pane is an AppKit
 * view beside the web contents, so it can hold the window's first responder
 * while the DOM still reports the field as focused: the caret blinks and every
 * keystroke goes to the terminal.
 */
let keyboardClaims = 0;

/**
 * Hold the keyboard in the renderer until the returned function is called.
 * Safe to call twice; the second release is a no-op.
 */
export function claimRendererKeyboard(): () => void {
  keyboardClaims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    keyboardClaims = Math.max(0, keyboardClaims - 1);
  };
}

/** Test seam: drops every outstanding claim. */
export function resetRendererKeyboardClaims(): void {
  keyboardClaims = 0;
}

export function hasEditableRendererFocus(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  if (activeElement.isContentEditable) {
    return true;
  }

  const tagName = activeElement.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function getWorkspaceGroupForPane(
  paneId: string,
): { workspace: Workspace; group: PaneGroup; tabId: string } | null {
  const state = useWorkspaceStore.getState();

  const owner = state.paneOwnersByPaneId[paneId];
  if (owner) {
    const workspace = state.workspaces.find((candidate) => candidate.id === owner.workspaceId);
    const group = state.paneGroups[owner.groupId];
    const tab = group?.tabs.find((candidate) => candidate.paneId === paneId);
    if (workspace && group && tab) {
      return { workspace, group, tabId: tab.id };
    }
  }

  for (const workspace of state.workspaces) {
    for (const groupId of collectGroupIds(workspace.root)) {
      const group = state.paneGroups[groupId];
      const tab = group?.tabs.find((candidate) => candidate.paneId === paneId);
      if (group && tab) {
        return { workspace, group, tabId: tab.id };
      }
    }
  }

  return null;
}

function getFocusedActivePaneContext(): ActivePaneContext | null {
  const state = useWorkspaceStore.getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId);
  if (!workspace) return null;

  const groupId = workspace.focusedGroupId ?? collectGroupIds(workspace.root)[0];
  if (!groupId) return null;

  const group = state.paneGroups[groupId];
  if (!group) return null;

  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);
  if (!activeTab) return null;

  const pane = state.panes[activeTab.paneId];
  if (!pane) return null;

  return { workspace, group, pane };
}

export function getFocusedActiveNativePane(): Pane | null {
  const context = getFocusedActivePaneContext();
  if (!context) {
    return null;
  }

  if (
    context.pane.type !== "terminal" &&
    context.pane.type !== "browser" &&
    context.pane.type !== "editor" &&
    context.pane.type !== "t3code"
  ) {
    return null;
  }

  return context.pane;
}

export function focusTerminalNativePane(paneId: string): void {
  recordNativeFocusRequest("terminal");
  void window.api.terminal.focus(paneId);
}

export function focusBrowserNativePane(paneId: string): void {
  recordNativeFocusRequest("browser");
  void window.api.browser.setFocus(paneId);
}

function focusPane(pane: Pane): void {
  if (pane.type === "terminal") {
    focusTerminalNativePane(pane.id);
    return;
  }

  if (pane.type === "browser" || pane.type === "editor" || pane.type === "t3code") {
    focusBrowserNativePane(pane.id);
  }
}

export function focusActiveNativePane(): void {
  if (useSettingsStore.getState().isOverlayActive()) {
    return;
  }

  if (useNativeViewStore.getState().temporarilyHiddenPaneId) {
    return;
  }

  if (keyboardClaims > 0 || hasEditableRendererFocus()) {
    return;
  }

  const pane = getFocusedActiveNativePane();
  if (!pane) return;

  if (
    pane.type === "terminal" &&
    (useTerminalStore.getState().findBarOpenByPaneId[pane.id] ?? false)
  ) {
    return;
  }

  if (
    (pane.type === "browser" || pane.type === "editor" || pane.type === "t3code") &&
    (useBrowserStore.getState().findBarOpenByPaneId[pane.id] ?? false)
  ) {
    return;
  }

  focusPane(pane);
}

export function syncWorkspaceFocusForPane(paneId: string): void {
  const result = getWorkspaceGroupForPane(paneId);
  if (!result) return;

  const workspaceId = result.workspace.id;
  const groupId = result.group.id;

  // Re-read between mutations: each setter replaces the slices the next check
  // reads, so `result`'s workspace/group snapshots go stale after the first
  // write and would make the later comparisons fire against old values.
  if (useWorkspaceStore.getState().activeWorkspaceId !== workspaceId) {
    useWorkspaceStore.getState().setActiveWorkspace(workspaceId);
  }

  const workspace = useWorkspaceStore
    .getState()
    .workspaces.find((candidate) => candidate.id === workspaceId);
  if (workspace && workspace.focusedGroupId !== groupId) {
    useWorkspaceStore.getState().setFocusedGroup(workspaceId, groupId);
  }

  const group = useWorkspaceStore.getState().paneGroups[groupId];
  if (group && group.activeTabId !== result.tabId) {
    useWorkspaceStore.getState().setActiveGroupTab(workspaceId, groupId, result.tabId);
  }
}

/**
 * Handles a focus notification pushed up from a native surface.
 *
 * Native surfaces also notify for focus *we* requested. When the active tab
 * changes between our `terminal.focus()` call and its echo, acting on that
 * echo drags the selection back to the previous pane — which re-arms that
 * pane's auto-focus effect, whose echo drags it forward again. Two panes then
 * ping-pong at IPC speed and never settle.
 *
 * A user can only click a surface that is on screen, so a notification naming
 * a pane that is not currently visible is always a stale echo. Drop it.
 */
export function syncWorkspaceFocusForNativeNotification(paneId: string): void {
  if (!isNativePaneOnScreen(paneId)) return;
  syncWorkspaceFocusForPane(paneId);
}

export function releaseNativeFocus(): void {
  void window.api.terminal.blur();
  window.api.window.focusContent?.();
}

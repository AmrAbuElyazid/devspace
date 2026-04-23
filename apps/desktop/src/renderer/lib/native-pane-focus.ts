import { collectGroupIds, useWorkspaceStore } from "../store/workspace-store";
import { useBrowserStore } from "../store/browser-store";
import { recordNativeFocusRequest } from "../store/native-view-store";
import { useNativeViewStore } from "../store/native-view-store";
import { useSettingsStore } from "../store/settings-store";
import { useTerminalStore } from "../store/terminal-store";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

interface ActivePaneContext {
  workspace: Workspace;
  group: PaneGroup;
  pane: Pane;
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

  if (hasEditableRendererFocus()) {
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

  const state = useWorkspaceStore.getState();
  if (state.activeWorkspaceId !== result.workspace.id) {
    state.setActiveWorkspace(result.workspace.id);
  }
  if (result.workspace.focusedGroupId !== result.group.id) {
    state.setFocusedGroup(result.workspace.id, result.group.id);
  }
  if (result.group.activeTabId !== result.tabId) {
    state.setActiveGroupTab(result.workspace.id, result.group.id, result.tabId);
  }
}

export function releaseNativeFocus(): void {
  void window.api.terminal.blur();
  window.api.window.focusContent?.();
}

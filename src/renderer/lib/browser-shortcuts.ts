import type { Pane, PaneGroup, Workspace } from "../types/workspace";
import { findFirstGroupId } from "../store/workspace-store";

interface BrowserShortcutWorkspaceState {
  activeWorkspaceId: string;
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
}

/** Get the focused pane's active tab content, or null. */
function getFocusedActivePane(state: BrowserShortcutWorkspaceState): Pane | null {
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!workspace) return null;
  const groupId = workspace.focusedGroupId ?? findFirstGroupId(workspace.root);
  if (!groupId) return null;
  const group = state.paneGroups[groupId];
  if (!group) return null;
  const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
  if (!activeTab) return null;
  return state.panes[activeTab.paneId] ?? null;
}

/** Get the focused browser pane (type "browser" only).
 *  Used for browser-specific actions: reload, back, forward, find, devtools. */
export function getActiveFocusedBrowserPane(state: BrowserShortcutWorkspaceState): Pane | null {
  const pane = getFocusedActivePane(state);
  return pane?.type === "browser" ? pane : null;
}

/** Get the focused WebView-based pane (browser, editor, or t3code).
 *  Used for actions that work on any WebContentsView: zoom. */
export function getActiveFocusedWebViewPane(state: BrowserShortcutWorkspaceState): Pane | null {
  const pane = getFocusedActivePane(state);
  if (!pane) return null;
  return pane.type === "browser" || pane.type === "editor" || pane.type === "t3code" ? pane : null;
}

export function getSplitShortcutTargetGroupId(workspace: Workspace): string | null {
  return workspace.focusedGroupId ?? findFirstGroupId(workspace.root);
}

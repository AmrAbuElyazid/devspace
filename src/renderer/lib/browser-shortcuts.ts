import type { Pane, SplitNode, PaneGroup, Workspace } from '../types/workspace'
import { findFirstGroupId } from '../store/workspace-store'

interface BrowserShortcutWorkspaceState {
  activeWorkspaceId: string
  workspaces: Workspace[]
  panes: Record<string, Pane>
  paneGroups: Record<string, PaneGroup>
}

export function getActiveFocusedBrowserPane(state: BrowserShortcutWorkspaceState): Pane | null {
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
  if (!workspace) return null
  const groupId = workspace.focusedGroupId ?? findFirstGroupId(workspace.root)
  if (!groupId) return null
  const group = state.paneGroups[groupId]
  if (!group) return null
  const activeTab = group.tabs.find((t) => t.id === group.activeTabId)
  if (!activeTab) return null
  const pane = state.panes[activeTab.paneId]
  return pane?.type === 'browser' ? pane : null
}

export function getSplitShortcutTargetGroupId(workspace: Workspace): string | null {
  return workspace.focusedGroupId ?? findFirstGroupId(workspace.root)
}

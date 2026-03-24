import type { Pane, SplitNode, Tab, Workspace } from '../types/workspace'

interface BrowserShortcutWorkspaceState {
  activeWorkspaceId: string
  workspaces: Workspace[]
  panes: Record<string, Pane>
}

function findFirstLeaf(node: SplitNode): string | null {
  if (node.type === 'leaf') {
    return node.paneId
  }

  for (const child of node.children) {
    const paneId = findFirstLeaf(child)
    if (paneId) {
      return paneId
    }
  }

  return null
}

export function getActiveFocusedBrowserPane(state: BrowserShortcutWorkspaceState): Pane | null {
  const workspace = state.workspaces.find((nextWorkspace) => nextWorkspace.id === state.activeWorkspaceId)
  if (!workspace) {
    return null
  }

  const tab = workspace.tabs.find((nextTab) => nextTab.id === workspace.activeTabId)
  const paneId = tab?.focusedPaneId
  if (!paneId) {
    return null
  }

  const pane = state.panes[paneId]
  return pane?.type === 'browser' ? pane : null
}

export function getSplitShortcutTargetPaneId(tab: Tab): string | null {
  return tab.focusedPaneId ?? findFirstLeaf(tab.root)
}

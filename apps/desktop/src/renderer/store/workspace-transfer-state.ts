import { nanoid } from "nanoid";
import { removeSidebarNode } from "../lib/sidebar-tree";
import { collectGroupIds } from "../lib/split-tree";
import type {
  PaneGroup,
  PaneGroupTab,
  SidebarNode,
  SplitNode,
  Workspace,
} from "../types/workspace";
import { removeGroupRecentState, type RecentTabTraversalState } from "./tab-history";

export function collectWorkspaceTabsForTransfer(
  workspaceRoot: SplitNode,
  paneGroups: Record<string, PaneGroup>,
): { sourceGroupIds: string[]; tabs: PaneGroupTab[] } {
  const sourceGroupIds = collectGroupIds(workspaceRoot);
  const tabs: PaneGroupTab[] = [];

  for (const groupId of sourceGroupIds) {
    const group = paneGroups[groupId];
    if (!group) {
      continue;
    }

    for (const tab of group.tabs) {
      tabs.push({ id: nanoid(), paneId: tab.paneId });
    }
  }

  return { sourceGroupIds, tabs };
}

export function removeWorkspaceFromSidebarState(
  sidebarTree: SidebarNode[],
  pinnedSidebarNodes: SidebarNode[],
  workspaceId: string,
): { sidebarTree: SidebarNode[]; pinnedSidebarNodes: SidebarNode[] } {
  const [nextSidebarTree] = removeSidebarNode(sidebarTree, workspaceId, "workspace");
  const [nextPinnedSidebarNodes] = removeSidebarNode(pinnedSidebarNodes, workspaceId, "workspace");

  return {
    sidebarTree: nextSidebarTree,
    pinnedSidebarNodes: nextPinnedSidebarNodes,
  };
}

export function removeWorkspaceGroupState(
  paneGroups: Record<string, PaneGroup>,
  tabHistoryByGroupId: Record<string, string[]>,
  recentTabTraversalByGroupId: Record<string, RecentTabTraversalState>,
  sourceGroupIds: string[],
): {
  paneGroups: Record<string, PaneGroup>;
  tabHistoryByGroupId: Record<string, string[]>;
  recentTabTraversalByGroupId: Record<string, RecentTabTraversalState>;
} {
  const nextPaneGroups = { ...paneGroups };
  const nextTabHistoryByGroupId = { ...tabHistoryByGroupId };
  let nextRecentTabTraversalByGroupId = recentTabTraversalByGroupId;

  for (const groupId of sourceGroupIds) {
    delete nextPaneGroups[groupId];
    delete nextTabHistoryByGroupId[groupId];
    nextRecentTabTraversalByGroupId = removeGroupRecentState(
      nextRecentTabTraversalByGroupId,
      groupId,
    );
  }

  return {
    paneGroups: nextPaneGroups,
    tabHistoryByGroupId: nextTabHistoryByGroupId,
    recentTabTraversalByGroupId: nextRecentTabTraversalByGroupId,
  };
}

export function removeWorkspaceRecord(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.filter((workspace) => workspace.id !== workspaceId);
}

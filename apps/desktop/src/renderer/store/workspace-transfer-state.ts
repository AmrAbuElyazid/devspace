import { nanoid } from "nanoid";
import { removeSidebarNode } from "../lib/sidebar-tree";
import { collectGroupIds, treeHasGroup } from "../lib/split-tree";
import type {
  Pane,
  PaneGroup,
  PaneGroupTab,
  SidebarNode,
  SplitNode,
  Workspace,
} from "../types/workspace";
import { buildDestinationGroupState } from "./group-tab-destination-state";
import { removeGroupRecentState, type RecentTabTraversalState } from "./tab-history";
import type { WorkspaceState } from "./workspace-state";

type WorkspaceTransferStateSlice = Pick<
  WorkspaceState,
  | "workspaces"
  | "activeWorkspaceId"
  | "sidebarTree"
  | "pinnedSidebarNodes"
  | "paneGroups"
  | "tabHistoryByGroupId"
  | "recentTabTraversalByGroupId"
>;

type WorkspaceTransferLookupState = Pick<WorkspaceState, "workspaces" | "paneGroups">;

type WorkspaceRemovalStateSlice = Pick<
  WorkspaceState,
  | "workspaces"
  | "activeWorkspaceId"
  | "panes"
  | "paneGroups"
  | "sidebarTree"
  | "pinnedSidebarNodes"
  | "tabHistoryByGroupId"
  | "recentTabTraversalByGroupId"
>;

type WorkspaceTransferContext = {
  sourceWorkspace: Workspace;
  targetWorkspace: Workspace;
  targetGroup: PaneGroup;
  sourceGroupIds: string[];
  tabs: PaneGroupTab[];
};

type WorkspaceRemovalState = Omit<WorkspaceRemovalStateSlice, "activeWorkspaceId"> & {
  activeWorkspaceId: string | null;
  removedPaneIds: string[];
};

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

export function removeWorkspacePaneState(
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
  sourceGroupIds: string[],
): { panes: Record<string, Pane>; removedPaneIds: string[] } {
  const nextPanes = { ...panes };
  const removedPaneIds: string[] = [];

  for (const groupId of sourceGroupIds) {
    const group = paneGroups[groupId];
    if (!group) {
      continue;
    }

    for (const tab of group.tabs) {
      removedPaneIds.push(tab.paneId);
      delete nextPanes[tab.paneId];
    }
  }

  return { panes: nextPanes, removedPaneIds };
}

export function removeWorkspaceRecord(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.filter((workspace) => workspace.id !== workspaceId);
}

export function buildWorkspaceRemovalState(
  state: WorkspaceRemovalStateSlice,
  workspaceId: string,
): WorkspaceRemovalState | null {
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    return null;
  }

  const sourceGroupIds = collectGroupIds(workspace.root);
  const nextPaneState = removeWorkspacePaneState(state.panes, state.paneGroups, sourceGroupIds);
  const nextGroupState = removeWorkspaceGroupState(
    state.paneGroups,
    state.tabHistoryByGroupId,
    state.recentTabTraversalByGroupId,
    sourceGroupIds,
  );
  const nextSidebarState = removeWorkspaceFromSidebarState(
    state.sidebarTree,
    state.pinnedSidebarNodes,
    workspaceId,
  );
  const workspaces = removeWorkspaceRecord(state.workspaces, workspaceId);

  let activeWorkspaceId: string | null = state.activeWorkspaceId;
  if (workspaces.length === 0) {
    activeWorkspaceId = null;
  } else if (state.activeWorkspaceId === workspaceId) {
    const removedWorkspaceIndex = state.workspaces.findIndex(
      (candidate) => candidate.id === workspaceId,
    );
    activeWorkspaceId =
      workspaces[Math.min(removedWorkspaceIndex, workspaces.length - 1)]?.id ?? workspaces[0]!.id;
  }

  return {
    workspaces,
    activeWorkspaceId,
    panes: nextPaneState.panes,
    paneGroups: nextGroupState.paneGroups,
    sidebarTree: nextSidebarState.sidebarTree,
    pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
    tabHistoryByGroupId: nextGroupState.tabHistoryByGroupId,
    recentTabTraversalByGroupId: nextGroupState.recentTabTraversalByGroupId,
    removedPaneIds: nextPaneState.removedPaneIds,
  };
}

export function buildTransferredWorkspaceDestinationState({
  state,
  group,
  tabs,
  activeTabId,
  sourceWorkspaceId,
  sourceGroupIds,
  fallbackActiveWorkspaceId,
}: {
  state: WorkspaceTransferStateSlice;
  group: PaneGroup;
  tabs: PaneGroupTab[];
  activeTabId: string;
  sourceWorkspaceId: string;
  sourceGroupIds: string[];
  fallbackActiveWorkspaceId: string;
}): WorkspaceTransferStateSlice {
  const destinationState = buildDestinationGroupState({
    state,
    group,
    tabs,
    activeTabId,
  });

  return removeTransferredWorkspaceSourceState({
    state: {
      ...state,
      paneGroups: destinationState.paneGroups,
      tabHistoryByGroupId: destinationState.tabHistoryByGroupId,
      recentTabTraversalByGroupId: destinationState.recentTabTraversalByGroupId,
    },
    sourceWorkspaceId,
    sourceGroupIds,
    fallbackActiveWorkspaceId,
  });
}

export function removeTransferredWorkspaceSourceState({
  state,
  sourceWorkspaceId,
  sourceGroupIds,
  fallbackActiveWorkspaceId,
}: {
  state: WorkspaceTransferStateSlice;
  sourceWorkspaceId: string;
  sourceGroupIds: string[];
  fallbackActiveWorkspaceId: string;
}): WorkspaceTransferStateSlice {
  const nextGroupState = removeWorkspaceGroupState(
    state.paneGroups,
    state.tabHistoryByGroupId,
    state.recentTabTraversalByGroupId,
    sourceGroupIds,
  );
  const nextSidebarState = removeWorkspaceFromSidebarState(
    state.sidebarTree,
    state.pinnedSidebarNodes,
    sourceWorkspaceId,
  );

  return {
    workspaces: removeWorkspaceRecord(state.workspaces, sourceWorkspaceId),
    activeWorkspaceId:
      state.activeWorkspaceId === sourceWorkspaceId
        ? fallbackActiveWorkspaceId
        : state.activeWorkspaceId,
    paneGroups: nextGroupState.paneGroups,
    tabHistoryByGroupId: nextGroupState.tabHistoryByGroupId,
    recentTabTraversalByGroupId: nextGroupState.recentTabTraversalByGroupId,
    sidebarTree: nextSidebarState.sidebarTree,
    pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
  };
}

export function resolveWorkspaceTransferContext(
  state: WorkspaceTransferLookupState,
  sourceWorkspaceId: string,
  targetGroupId: string,
): WorkspaceTransferContext | null {
  const sourceWorkspace = state.workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
  if (!sourceWorkspace) {
    return null;
  }

  const targetGroup = state.paneGroups[targetGroupId];
  if (!targetGroup) {
    return null;
  }

  const targetWorkspace = state.workspaces.find((workspace) =>
    treeHasGroup(workspace.root, targetGroupId),
  );
  if (!targetWorkspace || targetWorkspace.id === sourceWorkspace.id) {
    return null;
  }

  const { sourceGroupIds, tabs } = collectWorkspaceTabsForTransfer(
    sourceWorkspace.root,
    state.paneGroups,
  );

  return {
    sourceWorkspace,
    targetWorkspace,
    targetGroup,
    sourceGroupIds,
    tabs,
  };
}

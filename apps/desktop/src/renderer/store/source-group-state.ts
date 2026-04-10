import type { SourceGroupResolution } from "../lib/source-group-resolution";
import {
  buildRecentTabOrder,
  clearRecentTabTraversal,
  removeGroupRecentState,
  removeTabFromRecentOrder,
} from "./tab-history";
import type { WorkspaceState } from "./workspace-state";

type SourceGroupStateSlice = Pick<
  WorkspaceState,
  "workspaces" | "panes" | "paneGroups" | "tabHistoryByGroupId" | "recentTabTraversalByGroupId"
>;

interface ApplySourceGroupResolutionOptions {
  state: SourceGroupStateSlice;
  sourceWorkspaceId: string;
  sourceGroupId: string;
  removedTabId: string;
  resolution: SourceGroupResolution;
  nextWorkspaces?: WorkspaceState["workspaces"];
  nextPanes?: WorkspaceState["panes"];
  nextPaneGroups?: WorkspaceState["paneGroups"];
  nextTabHistoryByGroupId?: WorkspaceState["tabHistoryByGroupId"];
  nextRecentTabTraversalByGroupId?: WorkspaceState["recentTabTraversalByGroupId"];
  removedGroupTabHistoryMode?: "delete" | "empty";
}

export function applySourceGroupTabRemovalResolution({
  state,
  sourceWorkspaceId,
  sourceGroupId,
  removedTabId,
  resolution,
  nextWorkspaces = state.workspaces,
  nextPanes = state.panes,
  nextPaneGroups = state.paneGroups,
  nextTabHistoryByGroupId = state.tabHistoryByGroupId,
  nextRecentTabTraversalByGroupId = state.recentTabTraversalByGroupId,
  removedGroupTabHistoryMode = "delete",
}: ApplySourceGroupResolutionOptions): SourceGroupStateSlice {
  const panes = { ...nextPanes };
  const paneGroups = { ...nextPaneGroups };
  let workspaces = nextWorkspaces;
  const tabHistoryByGroupId = { ...nextTabHistoryByGroupId };
  let recentTabTraversalByGroupId = nextRecentTabTraversalByGroupId;

  switch (resolution.kind) {
    case "tabs-remaining":
      paneGroups[sourceGroupId] = resolution.srcGroup;
      tabHistoryByGroupId[sourceGroupId] = buildRecentTabOrder(
        removeTabFromRecentOrder(state.tabHistoryByGroupId[sourceGroupId], removedTabId),
        resolution.srcGroup.tabs,
        resolution.srcGroup.activeTabId,
      );
      recentTabTraversalByGroupId = clearRecentTabTraversal(
        recentTabTraversalByGroupId,
        sourceGroupId,
      );
      break;
    case "group-removed":
      delete paneGroups[sourceGroupId];
      workspaces = workspaces.map((workspace) =>
        workspace.id === sourceWorkspaceId
          ? {
              ...workspace,
              root: resolution.newRoot,
              focusedGroupId: resolution.newFocusedGroupId,
            }
          : workspace,
      );
      if (removedGroupTabHistoryMode === "empty") {
        tabHistoryByGroupId[sourceGroupId] = [];
      } else {
        delete tabHistoryByGroupId[sourceGroupId];
      }
      recentTabTraversalByGroupId = removeGroupRecentState(
        recentTabTraversalByGroupId,
        sourceGroupId,
      );
      break;
    case "group-replaced-with-fallback":
      panes[resolution.fallbackPane.id] = resolution.fallbackPane;
      paneGroups[sourceGroupId] = resolution.srcGroup;
      tabHistoryByGroupId[sourceGroupId] = buildRecentTabOrder(
        removeTabFromRecentOrder(state.tabHistoryByGroupId[sourceGroupId], removedTabId),
        resolution.srcGroup.tabs,
        resolution.srcGroup.activeTabId,
      );
      recentTabTraversalByGroupId = clearRecentTabTraversal(
        recentTabTraversalByGroupId,
        sourceGroupId,
      );
      break;
  }

  return {
    workspaces,
    panes,
    paneGroups,
    tabHistoryByGroupId,
    recentTabTraversalByGroupId,
  };
}

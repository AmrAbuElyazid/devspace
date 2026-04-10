import type { PaneGroup, PaneGroupTab } from "../types/workspace";
import { buildRecentTabOrder, clearRecentTabTraversal } from "./tab-history";
import type { WorkspaceState } from "./workspace-state";

type DestinationGroupStateSlice = Pick<
  WorkspaceState,
  "paneGroups" | "tabHistoryByGroupId" | "recentTabTraversalByGroupId"
>;

type BuildDestinationGroupStateOptions = {
  state: DestinationGroupStateSlice;
  group: PaneGroup;
  tabs: PaneGroupTab[];
  activeTabId: string;
};

export function buildDestinationGroupState({
  state,
  group,
  tabs,
  activeTabId,
}: BuildDestinationGroupStateOptions): DestinationGroupStateSlice {
  return {
    paneGroups: {
      ...state.paneGroups,
      [group.id]: {
        ...group,
        tabs,
        activeTabId,
      },
    },
    tabHistoryByGroupId: {
      ...state.tabHistoryByGroupId,
      [group.id]: buildRecentTabOrder(state.tabHistoryByGroupId[group.id], tabs, activeTabId),
    },
    recentTabTraversalByGroupId: clearRecentTabTraversal(
      state.recentTabTraversalByGroupId,
      group.id,
    ),
  };
}

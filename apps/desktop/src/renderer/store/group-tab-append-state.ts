import type { Pane, PaneGroup, PaneGroupTab } from "../types/workspace";
import type { WorkspaceState } from "./workspace-state";

type GroupTabAppendStateSlice = Pick<WorkspaceState, "panes" | "paneGroups">;

type AppendPaneToGroupStateOptions = {
  state: GroupTabAppendStateSlice;
  group: PaneGroup;
  pane: Pane;
  tabId: string;
};

export function appendPaneToGroupState({
  state,
  group,
  pane,
  tabId,
}: AppendPaneToGroupStateOptions): GroupTabAppendStateSlice & { newTab: PaneGroupTab } {
  const newTab: PaneGroupTab = { id: tabId, paneId: pane.id };

  return {
    panes: { ...state.panes, [pane.id]: pane },
    paneGroups: {
      ...state.paneGroups,
      [group.id]: {
        ...group,
        tabs: [...group.tabs, newTab],
        activeTabId: newTab.id,
      },
    },
    newTab,
  };
}

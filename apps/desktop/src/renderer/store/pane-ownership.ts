import { collectGroupIds } from "../lib/split-tree";
import type { PaneGroup, Workspace } from "../types/workspace";
import type { WorkspaceState } from "./workspace-state";

type PaneOwner = {
  workspaceId: string;
  groupId: string;
};

export function buildPaneOwnersByPaneId(
  workspaces: Workspace[],
  paneGroups: Record<string, PaneGroup>,
): Record<string, PaneOwner> {
  const paneOwnersByPaneId: Record<string, PaneOwner> = {};

  for (const workspace of workspaces) {
    for (const groupId of collectGroupIds(workspace.root)) {
      const group = paneGroups[groupId];
      if (!group) continue;

      for (const tab of group.tabs) {
        paneOwnersByPaneId[tab.paneId] = { workspaceId: workspace.id, groupId };
      }
    }
  }

  return paneOwnersByPaneId;
}

export function attachPaneOwnersByPaneId<State extends Partial<WorkspaceState>>(
  state: Pick<WorkspaceState, "workspaces" | "paneGroups">,
  patch: State,
): State & Pick<WorkspaceState, "paneOwnersByPaneId"> {
  const nextWorkspaces = patch.workspaces ?? state.workspaces;
  const nextPaneGroups = patch.paneGroups ?? state.paneGroups;

  return {
    ...patch,
    paneOwnersByPaneId: buildPaneOwnersByPaneId(nextWorkspaces, nextPaneGroups),
  };
}

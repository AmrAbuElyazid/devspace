import { collectGroupIds } from "../lib/split-tree";
import type { PaneGroup, Workspace } from "../types/workspace";
import { buildWorkspaceSidebarMetadataByWorkspaceId } from "./workspace-sidebar-metadata";
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

export function attachWorkspaceDerivedState<State extends Partial<WorkspaceState>>(
  state: Pick<WorkspaceState, "workspaces" | "panes" | "paneGroups">,
  patch: State,
): State & Pick<WorkspaceState, "paneOwnersByPaneId" | "workspaceSidebarMetadataByWorkspaceId"> {
  const nextWorkspaces = patch.workspaces ?? state.workspaces;
  const nextPaneGroups = patch.paneGroups ?? state.paneGroups;
  const nextPanes = patch.panes ?? state.panes;

  return {
    ...patch,
    paneOwnersByPaneId: buildPaneOwnersByPaneId(nextWorkspaces, nextPaneGroups),
    workspaceSidebarMetadataByWorkspaceId: buildWorkspaceSidebarMetadataByWorkspaceId(
      nextWorkspaces,
      nextPanes,
      nextPaneGroups,
    ),
  };
}

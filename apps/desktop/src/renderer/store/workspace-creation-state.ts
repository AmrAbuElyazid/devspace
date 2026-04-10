import { nanoid } from "nanoid";
import type { SidebarContainer } from "../types/dnd";
import type { Pane, PaneGroup, PaneGroupTab, Workspace } from "../types/workspace";
import {
  createDefaultWorkspace,
  createPaneGroup,
  createPaneGroupFromTabs,
} from "../lib/pane-factory";
import { treeHasGroup } from "../lib/split-tree";
import { getSidebarNodesForContainer, insertNodeIntoSidebarContainer } from "./store-helpers";
import type { WorkspaceState } from "./workspace-state";

type WorkspaceCreationSidebarState = Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">;

type WorkspaceTabCreationLookupState = Pick<WorkspaceState, "workspaces" | "paneGroups" | "panes">;

type WorkspaceCreationEntry = {
  group: PaneGroup;
  workspace: Workspace;
};

type WorkspaceTabCreationContext = {
  sourceWorkspace: Workspace;
  sourceGroup: PaneGroup;
  tab: PaneGroupTab;
  pane: Pane;
};

type WorkspaceSidebarInsertOptions = {
  container?: SidebarContainer;
  parentFolderId?: string | null;
  insertIndex?: number;
};

export function createWorkspaceEntryFromPane(name: string, pane: Pane): WorkspaceCreationEntry {
  const group = createPaneGroup(pane);

  return {
    group,
    workspace: createDefaultWorkspace(name, group),
  };
}

export function createWorkspaceEntryFromPaneId(
  name: string,
  paneId: string,
): WorkspaceCreationEntry {
  const group = createPaneGroupFromTabs([{ id: nanoid(), paneId }]);

  return {
    group,
    workspace: createDefaultWorkspace(name, group),
  };
}

export function insertWorkspaceIntoSidebarState(
  state: WorkspaceCreationSidebarState,
  workspaceId: string,
  options?: WorkspaceSidebarInsertOptions,
): WorkspaceCreationSidebarState {
  const container = options?.container ?? "main";
  const parentFolderId = options?.parentFolderId ?? null;
  const targetNodes = getSidebarNodesForContainer(state, container);
  const insertIndex = options?.insertIndex ?? targetNodes.length;

  return insertNodeIntoSidebarContainer(
    state,
    container,
    { type: "workspace", workspaceId },
    parentFolderId,
    insertIndex,
  );
}

export function resolveWorkspaceTabCreationContext(
  state: WorkspaceTabCreationLookupState,
  sourceWorkspaceId: string,
  sourceGroupId: string,
  tabId: string,
): WorkspaceTabCreationContext | null {
  const sourceWorkspace = state.workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
  if (!sourceWorkspace || !treeHasGroup(sourceWorkspace.root, sourceGroupId)) {
    return null;
  }

  const sourceGroup = state.paneGroups[sourceGroupId];
  if (!sourceGroup) {
    return null;
  }

  const tab = sourceGroup.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return null;
  }

  const pane = state.panes[tab.paneId];
  if (!pane) {
    return null;
  }

  return {
    sourceWorkspace,
    sourceGroup,
    tab,
    pane,
  };
}

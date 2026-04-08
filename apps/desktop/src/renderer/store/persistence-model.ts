import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";
import type { Pane, Workspace } from "../types/workspace";
import { validateWorkspaceGraph } from "../lib/workspace-graph";
import { normalizeSidebarPersistence } from "../lib/sidebar-organization";
import { collectGroupIds, findFirstGroupId, repairTree } from "../lib/split-tree";
import { createDefaultWorkspace, createPane, createPaneGroup } from "../lib/pane-factory";

export function normalizePersistedWorkspaceState(
  persisted: PersistedWorkspaceState,
): PersistedWorkspaceState | null {
  const workspaces = persisted.workspaces.map((workspace) => ({
    ...workspace,
    lastActiveAt: workspace.lastActiveAt ?? Date.now(),
  }));

  const panes: Record<string, Pane> = { ...persisted.panes };
  const paneGroups = { ...persisted.paneGroups };

  const validGroupIds = new Set(Object.keys(paneGroups));
  const repairedWorkspaces = workspaces.map((workspace) => {
    const repaired = repairTree(workspace.root, validGroupIds);
    if (!repaired) {
      const freshPane = createPane("terminal");
      const freshGroup = createPaneGroup(freshPane);
      panes[freshPane.id] = freshPane;
      paneGroups[freshGroup.id] = freshGroup;
      return {
        ...workspace,
        root: { type: "leaf" as const, groupId: freshGroup.id },
        focusedGroupId: freshGroup.id,
      };
    }

    if (repaired !== workspace.root) {
      const remainingGroups = collectGroupIds(repaired);
      const focusedGroupId =
        workspace.focusedGroupId && remainingGroups.includes(workspace.focusedGroupId)
          ? workspace.focusedGroupId
          : findFirstGroupId(repaired);
      return { ...workspace, root: repaired, focusedGroupId };
    }

    return workspace;
  });

  if (repairedWorkspaces.length === 0) {
    return null;
  }

  for (const [id, pane] of Object.entries(panes)) {
    if ((pane as Record<string, unknown>).type === "empty") {
      panes[id] = { ...pane, type: "terminal", title: "Terminal", config: {} } as Pane;
    }
  }

  const normalizedSidebar = normalizeSidebarPersistence({
    workspaces: repairedWorkspaces,
    pinnedSidebarNodes: persisted.pinnedSidebarNodes,
    sidebarTree: persisted.sidebarTree,
  });

  const fallbackActiveWorkspaceId = repairedWorkspaces[0]?.id;
  const activeWorkspaceId = repairedWorkspaces.some(
    (workspace) => workspace.id === persisted.activeWorkspaceId,
  )
    ? persisted.activeWorkspaceId
    : fallbackActiveWorkspaceId;

  if (!activeWorkspaceId) {
    return null;
  }

  const normalized: PersistedWorkspaceState = {
    workspaces: repairedWorkspaces,
    activeWorkspaceId,
    panes,
    paneGroups,
    pinnedSidebarNodes: normalizedSidebar.pinnedSidebarNodes,
    sidebarTree: normalizedSidebar.sidebarTree,
  };

  const validation = validateWorkspaceGraph({
    activeWorkspaceId: normalized.activeWorkspaceId,
    workspaces: normalized.workspaces,
    paneGroups: normalized.paneGroups,
    panes: normalized.panes,
  });
  if (!validation.valid) {
    console.warn(`[WorkspaceStore] Discarding invalid persisted state: ${validation.reason}`);
    return null;
  }

  return normalized;
}

export function createDefaultPersistedWorkspaceState(): PersistedWorkspaceState {
  const pane = createPane("terminal");
  const group = createPaneGroup(pane);
  const workspace: Workspace = createDefaultWorkspace("Workspace 1", group);

  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    panes: { [pane.id]: pane },
    paneGroups: { [group.id]: group },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace" as const, workspaceId: workspace.id }],
  };
}

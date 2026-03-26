import type { Pane, PaneGroup, SplitNode, Workspace } from "../types/workspace";

function collectGroupIds(root: SplitNode): string[] {
  if (root.type === "leaf") return [root.groupId];
  return root.children.flatMap(collectGroupIds);
}

function validateSplitNode(node: SplitNode): string | null {
  if (node.type === "leaf") return null;

  if (node.children.length < 2) {
    return "branch must have at least two children";
  }

  if (node.sizes.length !== node.children.length) {
    return "branch sizes must match child count";
  }

  if (node.sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    return "branch sizes must be finite positive numbers";
  }

  for (const child of node.children) {
    const childError = validateSplitNode(child);
    if (childError) return childError;
  }

  return null;
}

export function validateWorkspaceGraph({
  activeWorkspaceId,
  workspaces,
  paneGroups,
  panes,
}: {
  activeWorkspaceId: string;
  workspaces: Workspace[];
  paneGroups: Record<string, PaneGroup>;
  panes: Record<string, Pane>;
}): { valid: true } | { valid: false; reason: string } {
  if (!workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
    return { valid: false, reason: "activeWorkspaceId does not reference a workspace" };
  }

  const owningWorkspaceByGroupId = new Map<string, string>();

  for (const workspace of workspaces) {
    const splitError = validateSplitNode(workspace.root);
    if (splitError) {
      return { valid: false, reason: `workspace ${workspace.id}: ${splitError}` };
    }

    const groupIds = collectGroupIds(workspace.root);
    if (workspace.focusedGroupId && !groupIds.includes(workspace.focusedGroupId)) {
      return {
        valid: false,
        reason: `workspace ${workspace.id}: focusedGroupId is outside the tree`,
      };
    }

    for (const groupId of groupIds) {
      const existingOwner = owningWorkspaceByGroupId.get(groupId);
      if (existingOwner && existingOwner !== workspace.id) {
        return { valid: false, reason: `group ${groupId} is referenced by multiple workspaces` };
      }
      owningWorkspaceByGroupId.set(groupId, workspace.id);

      const group = paneGroups[groupId];
      if (!group) {
        return { valid: false, reason: `workspace ${workspace.id}: missing pane group ${groupId}` };
      }

      if (group.tabs.length === 0) {
        return { valid: false, reason: `group ${groupId} has no tabs` };
      }

      if (!group.tabs.some((tab) => tab.id === group.activeTabId)) {
        return { valid: false, reason: `group ${groupId} has an invalid activeTabId` };
      }

      for (const tab of group.tabs) {
        if (!panes[tab.paneId]) {
          return { valid: false, reason: `group ${groupId} references missing pane ${tab.paneId}` };
        }
      }
    }
  }

  return { valid: true };
}

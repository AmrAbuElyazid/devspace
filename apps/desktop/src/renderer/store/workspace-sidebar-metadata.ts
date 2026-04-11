import { collectGroupIds } from "../lib/split-tree";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

/** Return the last directory name from an absolute path (e.g. "/a/b/c" -> "c"). */
function lastPathSegment(path: string): string {
  const cleaned = path.endsWith("/") ? path.slice(0, -1) : path;
  const idx = cleaned.lastIndexOf("/");
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getWorkspaceSidebarMetadata(
  workspace: Workspace,
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): string {
  const groupIds = collectGroupIds(workspace.root);
  let paneCount = 0;
  let primaryDir = "";

  for (const groupId of groupIds) {
    const group = paneGroups[groupId];
    if (!group) continue;

    for (const tab of group.tabs) {
      const pane = panes[tab.paneId];
      if (!pane) continue;

      paneCount++;
      if (!primaryDir && pane.type === "terminal") {
        const cwd = pane.config.cwd;
        if (cwd) primaryDir = lastPathSegment(cwd);
      }
      if (!primaryDir && pane.type === "editor") {
        const folderPath = pane.config.folderPath;
        if (folderPath) primaryDir = lastPathSegment(folderPath);
      }
    }
  }

  const parts: string[] = [];
  if (paneCount > 0) parts.push(`${paneCount} pane${paneCount > 1 ? "s" : ""}`);
  if (primaryDir) parts.push(primaryDir);
  parts.push(formatRelativeTime(workspace.lastActiveAt));
  return parts.join(" · ");
}

export function buildWorkspaceSidebarMetadataByWorkspaceId(
  workspaces: Workspace[],
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): Record<string, string> {
  const workspaceSidebarMetadataByWorkspaceId: Record<string, string> = {};

  for (const workspace of workspaces) {
    workspaceSidebarMetadataByWorkspaceId[workspace.id] = getWorkspaceSidebarMetadata(
      workspace,
      panes,
      paneGroups,
    );
  }

  return workspaceSidebarMetadataByWorkspaceId;
}

export function updateWorkspaceSidebarMetadataByWorkspaceId(
  currentMetadataByWorkspaceId: Record<string, string>,
  workspaces: Workspace[],
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
  workspaceIds: string[],
): Record<string, string> {
  if (workspaceIds.length === 0) {
    return currentMetadataByWorkspaceId;
  }

  const nextMetadataByWorkspaceId = { ...currentMetadataByWorkspaceId };

  for (const workspaceId of workspaceIds) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      delete nextMetadataByWorkspaceId[workspaceId];
      continue;
    }

    nextMetadataByWorkspaceId[workspaceId] = getWorkspaceSidebarMetadata(
      workspace,
      panes,
      paneGroups,
    );
  }

  return nextMetadataByWorkspaceId;
}

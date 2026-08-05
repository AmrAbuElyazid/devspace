import { collectGroupIds } from "../lib/split-tree";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

/**
 * What a sidebar row shows besides its name.
 *
 * Structured rather than a pre-joined string: the row renders the directory on
 * its own line and the pane count in a fixed slot on the right, and it needs
 * the full path so it can truncate from the left and keep the meaningful tail.
 * The old `"3 panes · devspace · 2m ago"` collapsed all of that into one field
 * that could only ever be ellipsised into uselessness.
 */
export interface WorkspaceSidebarInfo {
  paneCount: number;
  /** Absolute path of the workspace's primary pane, or null if it has none. */
  directory: string | null;
}

function getWorkspaceSidebarInfo(
  workspace: Workspace,
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): WorkspaceSidebarInfo {
  const groupIds = collectGroupIds(workspace.root);
  let paneCount = 0;
  let directory: string | null = null;

  for (const groupId of groupIds) {
    const group = paneGroups[groupId];
    if (!group) continue;

    for (const tab of group.tabs) {
      const pane = panes[tab.paneId];
      if (!pane) continue;

      paneCount += 1;
      if (directory) continue;

      // First terminal or editor wins — those are the panes that carry a
      // meaningful location. A browser's URL is not a directory.
      if (pane.type === "terminal" && pane.config.cwd) {
        directory = pane.config.cwd;
      } else if (pane.type === "editor" && pane.config.folderPath) {
        directory = pane.config.folderPath;
      }
    }
  }

  // Falls back to whatever the workspace last recorded, so a workspace whose
  // panes are all browsers still says where it lives.
  return { paneCount, directory: directory ?? workspace.lastTerminalCwd ?? null };
}

export function buildWorkspaceSidebarMetadataByWorkspaceId(
  workspaces: Workspace[],
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): Record<string, WorkspaceSidebarInfo> {
  const byId: Record<string, WorkspaceSidebarInfo> = {};

  for (const workspace of workspaces) {
    byId[workspace.id] = getWorkspaceSidebarInfo(workspace, panes, paneGroups);
  }

  return byId;
}

export function updateWorkspaceSidebarMetadataByWorkspaceId(
  currentMetadataByWorkspaceId: Record<string, WorkspaceSidebarInfo>,
  workspaces: Workspace[],
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
  workspaceIds: string[],
): Record<string, WorkspaceSidebarInfo> {
  if (workspaceIds.length === 0) {
    return currentMetadataByWorkspaceId;
  }

  const next = { ...currentMetadataByWorkspaceId };

  for (const workspaceId of workspaceIds) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      delete next[workspaceId];
      continue;
    }
    next[workspaceId] = getWorkspaceSidebarInfo(workspace, panes, paneGroups);
  }

  return next;
}

import { collectGroupIds } from "../../store/workspace-store";
import type { Workspace, Pane, PaneGroup } from "../../types/workspace";

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now"; // also covers future timestamps (negative seconds)
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getWorkspaceMetadata(
  ws: Workspace,
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): string {
  const groupIds = collectGroupIds(ws.root);
  let paneCount = 0;
  let primaryDir = "";
  for (const gid of groupIds) {
    const group = paneGroups[gid];
    if (!group) continue;
    for (const tab of group.tabs) {
      const pane = panes[tab.paneId];
      if (!pane) continue;
      paneCount++;
      if (!primaryDir && pane.type === "terminal") {
        const cwd = pane.config.cwd;
        if (cwd) primaryDir = cwd.replace(/^\/Users\/[^/]+/, "~");
      }
      if (!primaryDir && pane.type === "editor") {
        const folder = pane.config.folderPath;
        if (folder) primaryDir = folder.replace(/^\/Users\/[^/]+/, "~");
      }
    }
  }
  const parts: string[] = [];
  if (paneCount > 0) parts.push(`${paneCount} pane${paneCount > 1 ? "s" : ""}`);
  if (primaryDir) parts.push(primaryDir);
  parts.push(formatRelativeTime(ws.lastActiveAt));
  return parts.join(" \u00b7 ");
}

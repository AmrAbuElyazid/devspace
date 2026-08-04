import type { SidebarPeekRow } from "../../shared/sidebar-peek";
import type { WorkspaceSidebarInfo } from "../store/workspace-sidebar-metadata";
import type { SidebarNode, Workspace } from "../types/workspace";
import { resolveWorkspaceColor, workspaceColorVar } from "./workspace-color";

interface SidebarPeekSource {
  pinnedSidebarNodes: SidebarNode[];
  sidebarTree: SidebarNode[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  metadataByWorkspaceId: Record<string, WorkspaceSidebarInfo>;
  portsByWorkspaceId: Record<string, number[]>;
}

function flatten(
  nodes: SidebarNode[],
  depth: number,
  source: SidebarPeekSource,
  out: SidebarPeekRow[],
): void {
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push({ kind: "folder", id: node.id, name: node.name, depth });
      // A collapsed folder shows as a heading with nothing under it, exactly as
      // it does in the real sidebar — the peek is a view of the sidebar, not a
      // second organisation of the same workspaces.
      if (!node.collapsed) flatten(node.children, depth + 1, source, out);
      continue;
    }

    const workspace = source.workspaces.find((candidate) => candidate.id === node.workspaceId);
    if (!workspace) continue;
    const info = source.metadataByWorkspaceId[workspace.id];
    out.push({
      kind: "workspace",
      id: workspace.id,
      name: workspace.name,
      color: workspaceColorVar(resolveWorkspaceColor(workspace.id, workspace.color)),
      directory: info?.directory ?? null,
      ports: source.portsByWorkspaceId[workspace.id] ?? [],
      paneCount: info?.paneCount ?? 0,
      active: workspace.id === source.activeWorkspaceId,
      depth,
    });
  }
}

/**
 * The sidebar flattened into rows the overlay's renderer can draw.
 *
 * Pinned nodes come first, as they do in the sidebar itself. Everything is
 * resolved here — colours to CSS values, ports and pane counts already merged —
 * because the other side has no store to look anything up in.
 */
export function buildSidebarPeekRows(source: SidebarPeekSource): SidebarPeekRow[] {
  const rows: SidebarPeekRow[] = [];
  flatten(source.pinnedSidebarNodes, 0, source, rows);
  flatten(source.sidebarTree, 0, source, rows);
  return rows;
}

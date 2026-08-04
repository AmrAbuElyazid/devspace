import type { SidebarPeekRow, SidebarPeekSection } from "../../shared/sidebar-peek";
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
 * The sidebar flattened into the sections the overlay's renderer can draw.
 *
 * Same sections in the same order as the sidebar itself, because the panel is
 * meant to read as the sidebar rather than as a menu of workspaces. Everything
 * is resolved here — colours to CSS values, ports and pane counts already
 * merged — because the other side has no store to look anything up in. An
 * empty section is dropped, exactly as the sidebar drops it.
 */
export function buildSidebarPeekSections(source: SidebarPeekSource): SidebarPeekSection[] {
  const sections: SidebarPeekSection[] = [];

  const pinned: SidebarPeekRow[] = [];
  flatten(source.pinnedSidebarNodes, 0, source, pinned);
  // No count on Pinned, because the sidebar's own header does not show one.
  if (pinned.length > 0) sections.push({ label: "Pinned", rows: pinned });

  const main: SidebarPeekRow[] = [];
  flatten(source.sidebarTree, 0, source, main);
  // Every workspace, not every row — the sidebar counts workspaces, and the
  // rows here include folder headings and exclude anything collapsed away.
  sections.push({ label: "Workspaces", count: source.workspaces.length, rows: main });

  return sections;
}

import type { SidebarNode } from "../types/workspace";
import { removeSidebarNode } from "./sidebar-tree";

interface WorkspaceRef {
  id: string;
}

interface SidebarOrganizationInput {
  workspaces: WorkspaceRef[];
  pinnedSidebarNodes: SidebarNode[];
  sidebarTree: SidebarNode[];
}

interface SidebarOrganizationOutput {
  pinnedSidebarNodes: SidebarNode[];
  sidebarTree: SidebarNode[];
}

interface SidebarPersistenceInput {
  workspaces: Array<WorkspaceRef & { pinned?: boolean }>;
  pinnedSidebarNodes?: SidebarNode[];
  sidebarTree: SidebarNode[];
}

function repairNodes(
  nodes: SidebarNode[],
  validWorkspaceIds: Set<string>,
  seenWorkspaceIds: Set<string>,
  seenFolderIds: Set<string>,
  ancestorFolderIds: Set<string> = new Set(),
): SidebarNode[] {
  const repaired: SidebarNode[] = [];

  for (const node of nodes) {
    if (node.type === "workspace") {
      if (!validWorkspaceIds.has(node.workspaceId)) continue;
      if (seenWorkspaceIds.has(node.workspaceId)) continue;
      seenWorkspaceIds.add(node.workspaceId);
      repaired.push(node);
      continue;
    }

    if (seenFolderIds.has(node.id)) continue;
    if (ancestorFolderIds.has(node.id)) continue;

    seenFolderIds.add(node.id);

    const nextAncestors = new Set(ancestorFolderIds);
    nextAncestors.add(node.id);

    repaired.push({
      ...node,
      children: repairNodes(
        node.children,
        validWorkspaceIds,
        seenWorkspaceIds,
        seenFolderIds,
        nextAncestors,
      ),
    });
  }

  return repaired;
}

export function repairSidebarOrganization(
  input: SidebarOrganizationInput,
): SidebarOrganizationOutput {
  const validWorkspaceIds = new Set(input.workspaces.map((workspace) => workspace.id));
  const seenWorkspaceIds = new Set<string>();
  const seenFolderIds = new Set<string>();

  const pinnedSidebarNodes = repairNodes(
    input.pinnedSidebarNodes,
    validWorkspaceIds,
    seenWorkspaceIds,
    seenFolderIds,
  );

  const sidebarTree = repairNodes(
    input.sidebarTree,
    validWorkspaceIds,
    seenWorkspaceIds,
    seenFolderIds,
  );

  const missingWorkspaceNodes: SidebarNode[] = input.workspaces
    .filter((workspace) => !seenWorkspaceIds.has(workspace.id))
    .map((workspace) => ({ type: "workspace", workspaceId: workspace.id }));

  return {
    pinnedSidebarNodes,
    sidebarTree: [...sidebarTree, ...missingWorkspaceNodes],
  };
}

export function normalizeSidebarPersistence(
  input: SidebarPersistenceInput,
): SidebarOrganizationOutput {
  let pinnedSidebarNodes = [...(input.pinnedSidebarNodes ?? [])];
  let sidebarTree = [...input.sidebarTree];

  for (const workspace of input.workspaces) {
    if (!workspace.pinned) continue;

    const [nextPinnedSidebarNodes, existingPinnedNode] = removeSidebarNode(
      pinnedSidebarNodes,
      workspace.id,
      "workspace",
    );
    const [nextSidebarTree, removedFromSidebarTree] = removeSidebarNode(
      sidebarTree,
      workspace.id,
      "workspace",
    );

    pinnedSidebarNodes = nextPinnedSidebarNodes;
    sidebarTree = nextSidebarTree;

    const pinnedNode = existingPinnedNode ?? removedFromSidebarTree;
    if (pinnedNode) {
      pinnedSidebarNodes = [...pinnedSidebarNodes, pinnedNode];
    }
  }

  return repairSidebarOrganization({
    workspaces: input.workspaces,
    pinnedSidebarNodes,
    sidebarTree,
  });
}

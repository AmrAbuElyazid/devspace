import type { DropSide } from "../types/dnd";
import type { SplitNode } from "../types/workspace";

// ---------------------------------------------------------------------------
// Tree query helpers (pure)
// ---------------------------------------------------------------------------

export function findParentOfGroup(
  root: SplitNode,
  groupId: string,
): { parent: SplitNode; index: number } | null {
  if (root.type === "leaf") return null;

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]!;
    if (child.type === "leaf" && child.groupId === groupId) {
      return { parent: root, index: i };
    }
    if (child.type === "branch") {
      const result = findParentOfGroup(child, groupId);
      if (result) return result;
    }
  }
  return null;
}

export function collectGroupIds(root: SplitNode): string[] {
  if (root.type === "leaf") return [root.groupId];
  return root.children.flatMap(collectGroupIds);
}

export function treeHasGroup(root: SplitNode, groupId: string): boolean {
  return collectGroupIds(root).includes(groupId);
}

/** Walk children[0] at each branch level to find the top-left leaf group. */
export function getTopLeftGroupId(root: SplitNode): string {
  if (root.type === "leaf") return root.groupId;
  return getTopLeftGroupId(root.children[0]!);
}

// Returns the first leaf's groupId in a tree.
export function findFirstGroupId(node: SplitNode): string | null {
  if (node.type === "leaf") return node.groupId;
  for (const child of node.children) {
    const gid = findFirstGroupId(child);
    if (gid) return gid;
  }
  return null;
}

// Finds a sibling groupId for focus transfer when a group is being removed.
export function findSiblingGroupId(root: SplitNode, groupId: string): string | null {
  const parentResult = findParentOfGroup(root, groupId);
  if (!parentResult || parentResult.parent.type !== "branch") return null;

  const siblings = parentResult.parent.children;
  // Prefer previous sibling, else next
  const siblingIndex = parentResult.index > 0 ? parentResult.index - 1 : 1;
  if (siblingIndex >= 0 && siblingIndex < siblings.length) {
    const sibling = siblings[siblingIndex]!;
    return sibling.type === "leaf" ? sibling.groupId : findFirstGroupId(sibling);
  }
  return null;
}

export function buildSplitReplacement(
  targetGroupId: string,
  newGroupId: string,
  side: DropSide,
): SplitNode {
  const direction = side === "left" || side === "right" ? "horizontal" : "vertical";
  const newLeaf: SplitNode = { type: "leaf", groupId: newGroupId };
  const targetLeaf: SplitNode = { type: "leaf", groupId: targetGroupId };
  const children: SplitNode[] =
    side === "left" || side === "top" ? [newLeaf, targetLeaf] : [targetLeaf, newLeaf];

  return {
    type: "branch",
    direction,
    children,
    sizes: [50, 50],
  };
}

// ---------------------------------------------------------------------------
// Tree mutation helpers (pure, immutable)
// ---------------------------------------------------------------------------

export function simplifyTree(node: SplitNode): SplitNode {
  if (node.type === "leaf") return node;

  const simplified: SplitNode = {
    ...node,
    children: node.children.map(simplifyTree),
  };

  if (simplified.type === "branch" && simplified.children.length === 1) {
    return simplified.children[0]!;
  }

  return simplified;
}

/**
 * Remove tree leaves whose groupId is not in `validGroupIds`.
 * Returns the repaired tree, or null if every leaf was orphaned.
 */
export function repairTree(node: SplitNode, validGroupIds: Set<string>): SplitNode | null {
  if (node.type === "leaf") {
    return validGroupIds.has(node.groupId) ? node : null;
  }

  const newChildren: SplitNode[] = [];
  const newSizes: number[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const result = repairTree(node.children[i]!, validGroupIds);
    if (result !== null) {
      newChildren.push(result);
      newSizes.push(node.sizes[i]!);
    }
  }

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]!;

  // Re-normalize sizes
  const sizeSum = newSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = newSizes.map((s) => (s / sizeSum) * 100);

  return {
    type: "branch",
    direction: node.direction,
    children: newChildren,
    sizes: normalizedSizes,
  };
}

export function removeGroupFromTree(root: SplitNode, groupId: string): SplitNode | null {
  if (root.type === "leaf") {
    return root.groupId === groupId ? null : root;
  }

  const newChildren: SplitNode[] = [];
  const newSizes: number[] = [];
  let changed = false;

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]!;
    const result = removeGroupFromTree(child, groupId);
    if (result !== null) {
      if (result !== child) changed = true;
      newChildren.push(result);
      newSizes.push(root.sizes[i]!);
    } else {
      changed = true;
    }
  }

  // Group not found in this subtree — return unchanged
  if (!changed) return root;

  if (newChildren.length === 0) return null;

  // Re-normalize sizes so they sum to 100
  const sizeSum = newSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = newSizes.map((s) => (s / sizeSum) * 100);

  const branch: SplitNode = {
    type: "branch",
    direction: root.direction,
    children: newChildren,
    sizes: normalizedSizes,
  };

  return simplifyTree(branch);
}

// Replace a leaf matching `targetGroupId` with `replacement` (immutable).
export function replaceLeafInTree(
  node: SplitNode,
  targetGroupId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === "leaf") {
    return node.groupId === targetGroupId ? replacement : node;
  }

  return {
    ...node,
    children: node.children.map((child) => replaceLeafInTree(child, targetGroupId, replacement)),
  };
}

// Navigate to a branch node via a path of child indices and update its sizes.
export function updateSizesAtPath(node: SplitNode, path: number[], sizes: number[]): SplitNode {
  if (path.length === 0) {
    if (node.type === "branch") {
      return { ...node, sizes };
    }
    return node;
  }

  if (node.type === "leaf") return node;

  const [head, ...rest] = path;
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === head ? updateSizesAtPath(child, rest, sizes) : child,
    ),
  };
}

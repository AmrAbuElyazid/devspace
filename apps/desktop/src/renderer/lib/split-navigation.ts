/**
 * Directional navigation through a SplitNode tree.
 *
 * Given a focused groupId and a direction (left/right/up/down), finds the
 * geometrically adjacent group in the split layout.
 *
 * Algorithm:
 * 1. Find the path from root to the focused group (list of child indices)
 * 2. Walk up the path to find the nearest ancestor whose split direction
 *    matches the movement axis (horizontal for left/right, vertical for up/down)
 * 3. Move to the adjacent child in the desired direction
 * 4. Descend into that subtree to find the appropriate edge leaf
 */

import type { SplitNode } from "../types/workspace";

export type FocusDirection = "left" | "right" | "up" | "down";

/** A step in the path from root to a leaf: the branch node and the child index taken. */
interface PathStep {
  node: SplitNode & { type: "branch" };
  childIndex: number;
}

/**
 * Find the path from the root to a leaf with the given groupId.
 * Returns an array of PathSteps, or null if the groupId is not in the tree.
 */
function findPathToGroup(root: SplitNode, groupId: string): PathStep[] | null {
  if (root.type === "leaf") {
    return root.groupId === groupId ? [] : null;
  }

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (!child) continue;
    const subPath = findPathToGroup(child, groupId);
    if (subPath !== null) {
      return [{ node: root as SplitNode & { type: "branch" }, childIndex: i }, ...subPath];
    }
  }

  return null;
}

/** Get the first (top-left-most) leaf in a subtree. */
function getFirstLeaf(node: SplitNode): string {
  if (node.type === "leaf") return node.groupId;
  return getFirstLeaf(node.children[0]!);
}

/** Get the last (bottom-right-most) leaf in a subtree. */
function getLastLeaf(node: SplitNode): string {
  if (node.type === "leaf") return node.groupId;
  return getLastLeaf(node.children[node.children.length - 1]!);
}

/**
 * Find the group in the given direction from the currently focused group.
 * Returns the target groupId, or null if there's no group in that direction
 * (i.e., already at the edge).
 */
export function findGroupInDirection(
  root: SplitNode,
  currentGroupId: string,
  direction: FocusDirection,
): string | null {
  const path = findPathToGroup(root, currentGroupId);
  if (!path) return null;

  // Determine which axis and which direction (+1 or -1) we're moving
  const axis = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const delta = direction === "right" || direction === "down" ? 1 : -1;

  // Walk up the path to find a matching ancestor
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const step = path[depth]!;
    const branch = step.node;

    // Only consider branches whose direction matches our movement axis
    if (branch.direction !== axis) continue;

    const targetIndex = step.childIndex + delta;

    // Check bounds — if we're at the edge, continue walking up
    if (targetIndex < 0 || targetIndex >= branch.children.length) continue;

    // Found a valid adjacent child. Descend into it to find the edge leaf.
    const targetChild = branch.children[targetIndex]!;

    // When moving right/down, take the first (top-left) leaf of the target subtree.
    // When moving left/up, take the last (bottom-right) leaf.
    if (delta > 0) {
      return getFirstLeaf(targetChild);
    }
    return getLastLeaf(targetChild);
  }

  // No ancestor with a matching direction had room to move — we're at the edge
  return null;
}

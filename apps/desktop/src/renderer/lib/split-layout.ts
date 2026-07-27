import type { SplitNode } from "../types/workspace";

export type SplitBranch = Extract<SplitNode, { type: "branch" }>;

/**
 * React key for the `<Allotment>` instance rendering `node`.
 *
 * allotment builds its SplitView once, inside a mount-only effect that captures
 * the orientation and the initial view sizes. The container's CSS class, by
 * contrast, is recomputed every render. Reusing the instance across a direction
 * change therefore leaves it laying out along the old axis while the class flips
 * to the new one: panes keep their stale inline offsets and lose the sizing rule
 * that the old class provided. Remounting is the only way to change the axis,
 * and a changed child count is the only other case where `defaultSizes` has to
 * be re-read.
 *
 * Deliberately scoped to direction and child count. Keying on the child subtrees
 * would remount unchanged siblings too, and reordering with the same count is
 * already handled by the per-pane keys.
 */
export function splitLayoutInstanceKey(node: SplitBranch): string {
  return `${node.direction}:${node.children.length}`;
}

/**
 * Normalize allotment's pixel sizes to percentages summing to 100, which is the
 * format the split tree stores (`buildSplitReplacement` writes `[50, 50]`, and
 * `removeGroupFromTree` / `repairTree` renormalize to 100). Percentages are also
 * resolution-independent, so they survive a window resize between mounts.
 *
 * Returns null for input that can't be normalized — an empty list, or a layout
 * measured before the container has a size.
 */
export function toPercentageSizes(sizes: number[]): number[] | null {
  if (sizes.length === 0) return null;

  let total = 0;
  for (const size of sizes) {
    if (!Number.isFinite(size) || size < 0) return null;
    total += size;
  }
  if (total <= 0) return null;

  return sizes.map((size) => (size / total) * 100);
}

/**
 * Half a percentage point. allotment's layout is driven by a ResizeObserver and
 * reports pixel sizes, so integer rounding makes the proportions wobble slightly
 * on every window resize even when the user hasn't touched a sash. Anything
 * under this threshold is that rounding noise, not an intentional drag.
 */
const SIZE_EPSILON = 0.5;

export function sizesAreEquivalent(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((size, i) => Math.abs(size - b[i]!) < SIZE_EPSILON);
}

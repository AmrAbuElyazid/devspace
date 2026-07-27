import { expect, test } from "vitest";
import {
  sizesAreEquivalent,
  splitLayoutInstanceKey,
  toPercentageSizes,
  type SplitBranch,
} from "./split-layout";

function branch(direction: SplitBranch["direction"], childCount: number): SplitBranch {
  return {
    type: "branch",
    direction,
    children: Array.from({ length: childCount }, (_, i) => ({
      type: "leaf" as const,
      groupId: `group-${i}`,
    })),
    sizes: Array.from({ length: childCount }, () => 100 / childCount),
  };
}

test("splitLayoutInstanceKey changes when the direction flips", () => {
  // The reported bug: dropping a tab on an edge can collapse the tree down to a
  // branch whose direction is the opposite of what was mounted. allotment can't
  // change axis in place, so this key has to change for React to remount it.
  expect(splitLayoutInstanceKey(branch("vertical", 2))).not.toBe(
    splitLayoutInstanceKey(branch("horizontal", 2)),
  );
});

test("splitLayoutInstanceKey changes when a pane is added or removed", () => {
  expect(splitLayoutInstanceKey(branch("horizontal", 2))).not.toBe(
    splitLayoutInstanceKey(branch("horizontal", 3)),
  );
});

test("splitLayoutInstanceKey is stable when children are reordered", () => {
  // Reordering same-count, same-direction children must not remount: the
  // per-pane keys already handle it, and remounting would churn native views.
  const original = branch("horizontal", 2);
  const reordered: SplitBranch = { ...original, children: original.children.toReversed() };

  expect(splitLayoutInstanceKey(reordered)).toBe(splitLayoutInstanceKey(original));
});

test("toPercentageSizes converts pixel sizes to percentages summing to 100", () => {
  expect(toPercentageSizes([300, 700])).toEqual([30, 70]);

  const thirds = toPercentageSizes([250, 250, 250])!;
  expect(thirds.reduce((sum, size) => sum + size, 0)).toBeCloseTo(100);
});

test("toPercentageSizes leaves already-normalized sizes alone", () => {
  expect(toPercentageSizes([50, 50])).toEqual([50, 50]);
});

test("toPercentageSizes rejects input it cannot normalize", () => {
  // A layout measured before the container has a size, or a collapsed pane set.
  expect(toPercentageSizes([])).toBeNull();
  expect(toPercentageSizes([0, 0])).toBeNull();
  expect(toPercentageSizes([Number.NaN, 100])).toBeNull();
  expect(toPercentageSizes([-10, 110])).toBeNull();
});

test("a window resize keeps the same proportions and so counts as unchanged", () => {
  // Same 40/60 split measured in a 1000px and then a 1237px container. The
  // pixel numbers are completely different; the proportions are not.
  const before = toPercentageSizes([400, 600])!;
  const after = toPercentageSizes([495, 742])!;

  expect(sizesAreEquivalent(before, after)).toBe(true);
});

test("dragging a sash counts as changed", () => {
  const before = toPercentageSizes([500, 500])!;
  const after = toPercentageSizes([560, 440])!;

  expect(sizesAreEquivalent(before, after)).toBe(false);
});

test("sizesAreEquivalent treats a different pane count as changed", () => {
  expect(sizesAreEquivalent([50, 50], [33, 33, 34])).toBe(false);
});

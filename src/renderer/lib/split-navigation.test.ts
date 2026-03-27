import { describe, expect, it } from "vitest";
import { findGroupInDirection } from "./split-navigation";
import type { SplitNode } from "../types/workspace";

// Helper to create leaf nodes
const leaf = (groupId: string): SplitNode => ({ type: "leaf", groupId });
// Helper to create branch nodes
const hBranch = (children: SplitNode[]): SplitNode => ({
  type: "branch",
  direction: "horizontal",
  children,
  sizes: children.map(() => 100 / children.length),
});
const vBranch = (children: SplitNode[]): SplitNode => ({
  type: "branch",
  direction: "vertical",
  children,
  sizes: children.map(() => 100 / children.length),
});

describe("findGroupInDirection", () => {
  it("returns null for a single leaf (no movement possible)", () => {
    const root = leaf("A");
    expect(findGroupInDirection(root, "A", "left")).toBeNull();
    expect(findGroupInDirection(root, "A", "right")).toBeNull();
    expect(findGroupInDirection(root, "A", "up")).toBeNull();
    expect(findGroupInDirection(root, "A", "down")).toBeNull();
  });

  it("returns null for unknown groupId", () => {
    const root = hBranch([leaf("A"), leaf("B")]);
    expect(findGroupInDirection(root, "X", "left")).toBeNull();
  });

  // Simple horizontal split: A | B
  describe("horizontal split [A, B]", () => {
    const root = hBranch([leaf("A"), leaf("B")]);

    it("A → right = B", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("B");
    });

    it("B → left = A", () => {
      expect(findGroupInDirection(root, "B", "left")).toBe("A");
    });

    it("A → left = null (at edge)", () => {
      expect(findGroupInDirection(root, "A", "left")).toBeNull();
    });

    it("B → right = null (at edge)", () => {
      expect(findGroupInDirection(root, "B", "right")).toBeNull();
    });

    it("A → up/down = null (wrong axis)", () => {
      expect(findGroupInDirection(root, "A", "up")).toBeNull();
      expect(findGroupInDirection(root, "A", "down")).toBeNull();
    });
  });

  // Simple vertical split: A / B
  describe("vertical split [A, B]", () => {
    const root = vBranch([leaf("A"), leaf("B")]);

    it("A → down = B", () => {
      expect(findGroupInDirection(root, "A", "down")).toBe("B");
    });

    it("B → up = A", () => {
      expect(findGroupInDirection(root, "B", "up")).toBe("A");
    });

    it("A → up = null (at edge)", () => {
      expect(findGroupInDirection(root, "A", "up")).toBeNull();
    });

    it("A → left/right = null (wrong axis)", () => {
      expect(findGroupInDirection(root, "A", "left")).toBeNull();
      expect(findGroupInDirection(root, "A", "right")).toBeNull();
    });
  });

  // Three-way horizontal: A | B | C
  describe("three-way horizontal [A, B, C]", () => {
    const root = hBranch([leaf("A"), leaf("B"), leaf("C")]);

    it("A → right = B", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("B");
    });

    it("B → right = C", () => {
      expect(findGroupInDirection(root, "B", "right")).toBe("C");
    });

    it("C → left = B", () => {
      expect(findGroupInDirection(root, "C", "left")).toBe("B");
    });

    it("B → left = A", () => {
      expect(findGroupInDirection(root, "B", "left")).toBe("A");
    });
  });

  // Nested: (A | B) / C — top row has horizontal split, bottom is single pane
  describe("nested: horizontal over vertical", () => {
    //  A | B
    //  -----
    //    C
    const root = vBranch([hBranch([leaf("A"), leaf("B")]), leaf("C")]);

    it("A → right = B", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("B");
    });

    it("A → down = C", () => {
      expect(findGroupInDirection(root, "A", "down")).toBe("C");
    });

    it("B → down = C", () => {
      expect(findGroupInDirection(root, "B", "down")).toBe("C");
    });

    it("C → up = B (last leaf of top sibling, nearest edge when entering from below)", () => {
      expect(findGroupInDirection(root, "C", "up")).toBe("B");
    });

    it("C → down = null (at edge)", () => {
      expect(findGroupInDirection(root, "C", "down")).toBeNull();
    });

    it("C → left/right = null (C's parent is vertical)", () => {
      expect(findGroupInDirection(root, "C", "left")).toBeNull();
      expect(findGroupInDirection(root, "C", "right")).toBeNull();
    });
  });

  // Deep nesting: ((A | B) / C) | D
  describe("deep nesting: ((A|B)/C) | D", () => {
    //  A | B | D
    //  -----
    //    C   | D
    const inner = vBranch([hBranch([leaf("A"), leaf("B")]), leaf("C")]);
    const root = hBranch([inner, leaf("D")]);

    it("A → right = B (within inner horizontal)", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("B");
    });

    it("B → right = D (crosses to outer horizontal)", () => {
      expect(findGroupInDirection(root, "B", "right")).toBe("D");
    });

    it("C → right = D (crosses to outer horizontal)", () => {
      expect(findGroupInDirection(root, "C", "right")).toBe("D");
    });

    it("D → left = C (takes last leaf of left sibling subtree, nearest edge)", () => {
      expect(findGroupInDirection(root, "D", "left")).toBe("C");
    });

    it("A → down = C (within inner vertical)", () => {
      expect(findGroupInDirection(root, "A", "down")).toBe("C");
    });

    it("D → down = null (D's ancestors have no vertical branch)", () => {
      expect(findGroupInDirection(root, "D", "down")).toBeNull();
    });
  });

  // Sibling with nested subtree: moving left from D enters rightmost leaf of left subtree
  describe("sibling subtree edge selection", () => {
    // A | (B / C)
    const root = hBranch([leaf("A"), vBranch([leaf("B"), leaf("C")])]);

    it("A → right = B (first leaf of right subtree)", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("B");
    });

    it("B → left = A", () => {
      expect(findGroupInDirection(root, "B", "left")).toBe("A");
    });

    it("C → left = A (last leaf going left still exits to A)", () => {
      expect(findGroupInDirection(root, "C", "left")).toBe("A");
    });
  });

  // Moving into a subtree: take the "nearest edge" leaf
  describe("entering subtree picks correct edge", () => {
    // (A / B) | (C / D)
    const root = hBranch([vBranch([leaf("A"), leaf("B")]), vBranch([leaf("C"), leaf("D")])]);

    it("B → right = C (moving right enters first leaf of right subtree)", () => {
      expect(findGroupInDirection(root, "B", "right")).toBe("C");
    });

    it("D → left = B (moving left enters last leaf of left subtree)", () => {
      expect(findGroupInDirection(root, "D", "left")).toBe("B");
    });

    it("A → right = C (first leaf of right subtree)", () => {
      expect(findGroupInDirection(root, "A", "right")).toBe("C");
    });

    it("C → left = A (last leaf = B? No: getLastLeaf returns B)", () => {
      // getLastLeaf of vBranch([A, B]) = B
      expect(findGroupInDirection(root, "C", "left")).toBe("B");
    });
  });
});

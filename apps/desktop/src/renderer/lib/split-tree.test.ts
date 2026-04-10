import { expect, test } from "vitest";
import { buildSplitReplacement } from "./split-tree";

test("buildSplitReplacement places the new group before the target on left drops", () => {
  const replacement = buildSplitReplacement("target-group", "new-group", "left");

  expect(replacement).toEqual({
    type: "branch",
    direction: "horizontal",
    children: [
      { type: "leaf", groupId: "new-group" },
      { type: "leaf", groupId: "target-group" },
    ],
    sizes: [50, 50],
  });
});

test("buildSplitReplacement places the new group after the target on bottom drops", () => {
  const replacement = buildSplitReplacement("target-group", "new-group", "bottom");

  expect(replacement).toEqual({
    type: "branch",
    direction: "vertical",
    children: [
      { type: "leaf", groupId: "target-group" },
      { type: "leaf", groupId: "new-group" },
    ],
    sizes: [50, 50],
  });
});

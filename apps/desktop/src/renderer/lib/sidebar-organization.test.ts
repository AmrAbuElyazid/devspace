import { test, expect } from "vitest";
import type { SidebarNode } from "../types/workspace";
import { normalizeSidebarPersistence, repairSidebarOrganization } from "./sidebar-organization";
import { collectSelectionKeys, partitionSelectionKeys } from "./sidebar-tree";

function folder(id: string, name: string, children: SidebarNode[] = []): SidebarNode {
  return {
    type: "folder",
    id,
    name,
    collapsed: false,
    children,
  };
}

function workspace(workspaceId: string): SidebarNode {
  return { type: "workspace", workspaceId };
}

test("repairSidebarOrganization removes duplicate workspace occurrences after the first valid one", () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
    pinnedSidebarNodes: [{ type: "workspace", workspaceId: "ws-1" }],
    sidebarTree: [
      { type: "workspace", workspaceId: "ws-1" },
      { type: "workspace", workspaceId: "ws-2" },
    ],
  });

  expect(repaired.pinnedSidebarNodes).toEqual([{ type: "workspace", workspaceId: "ws-1" }]);
  expect(repaired.sidebarTree).toEqual([{ type: "workspace", workspaceId: "ws-2" }]);
});

test("repairSidebarOrganization drops orphaned workspace references and appends missing workspaces to main tree", () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
    pinnedSidebarNodes: [{ type: "workspace", workspaceId: "missing" }],
    sidebarTree: [],
  });

  expect(repaired.pinnedSidebarNodes).toEqual([]);
  expect(repaired.sidebarTree).toEqual([
    { type: "workspace", workspaceId: "ws-1" },
    { type: "workspace", workspaceId: "ws-2" },
  ]);
});

test("repairSidebarOrganization keeps the first folder id occurrence and drops later duplicates", () => {
  const repaired = repairSidebarOrganization({
    workspaces: [{ id: "ws-1" }],
    pinnedSidebarNodes: [folder("folder-1", "Pinned Folder")],
    sidebarTree: [
      folder("folder-1", "Duplicate Folder", [{ type: "workspace", workspaceId: "ws-1" }]),
    ],
  });

  expect(repaired.pinnedSidebarNodes).toEqual([folder("folder-1", "Pinned Folder")]);
  expect(repaired.sidebarTree).toEqual([{ type: "workspace", workspaceId: "ws-1" }]);
});

test("repairSidebarOrganization drops cyclical folder insertion points", () => {
  const repaired = repairSidebarOrganization({
    workspaces: [],
    pinnedSidebarNodes: [],
    sidebarTree: [
      folder("folder-1", "Parent", [folder("folder-2", "Child", [folder("folder-1", "Cycle")])]),
    ],
  });

  expect(repaired.sidebarTree).toEqual([
    folder("folder-1", "Parent", [folder("folder-2", "Child")]),
  ]);
});

test("normalizeSidebarPersistence initializes missing pinnedSidebarNodes to an empty array", () => {
  const normalized = normalizeSidebarPersistence({
    workspaces: [{ id: "ws-1" }],
    sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
  });

  expect(normalized.pinnedSidebarNodes).toEqual([]);
  expect(normalized.sidebarTree).toEqual([{ type: "workspace", workspaceId: "ws-1" }]);
});

test("normalizeSidebarPersistence migrates legacy pinned workspaces into pinnedSidebarNodes without duplication", () => {
  const normalized = normalizeSidebarPersistence({
    workspaces: [{ id: "ws-1", pinned: true }, { id: "ws-2" }],
    pinnedSidebarNodes: [],
    sidebarTree: [
      { type: "workspace", workspaceId: "ws-1" },
      { type: "workspace", workspaceId: "ws-2" },
    ],
  });

  expect(normalized.pinnedSidebarNodes).toEqual([{ type: "workspace", workspaceId: "ws-1" }]);
  expect(normalized.sidebarTree).toEqual([{ type: "workspace", workspaceId: "ws-2" }]);
});

test("collectSelectionKeys walks folders and workspaces in visual order", () => {
  const tree: SidebarNode[] = [
    folder("f1", "One", [workspace("a"), folder("f2", "Two", [workspace("b")])]),
    workspace("c"),
  ];

  expect(collectSelectionKeys(tree)).toEqual(["f:f1", "w:a", "f:f2", "w:b", "w:c"]);
});

test("collectSelectionKeys keeps a collapsed folder but skips what is inside it", () => {
  const collapsed = folder("f1", "One", [workspace("a")]);
  if (collapsed.type === "folder") collapsed.collapsed = true;
  const tree: SidebarNode[] = [collapsed, workspace("b")];

  // Shift-clicking across a collapsed folder must not select rows the user
  // cannot see…
  expect(collectSelectionKeys(tree)).toEqual(["f:f1", "w:b"]);
  // …but pruning a stale selection has to know those rows still exist.
  expect(collectSelectionKeys(tree, true)).toEqual(["f:f1", "w:a", "w:b"]);
});

test("partitionSelectionKeys splits a mixed selection by kind", () => {
  expect(partitionSelectionKeys(["w:a", "f:f1", "w:b"])).toEqual({
    workspaceIds: ["a", "b"],
    folderIds: ["f1"],
  });
});

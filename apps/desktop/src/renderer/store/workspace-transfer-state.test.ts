import { expect, test } from "vitest";
import {
  collectWorkspaceTabsForTransfer,
  removeWorkspaceFromSidebarState,
  removeWorkspaceGroupState,
  removeWorkspaceRecord,
} from "./workspace-transfer-state";

test("collectWorkspaceTabsForTransfer flattens groups into fresh tab ids", () => {
  const result = collectWorkspaceTabsForTransfer(
    {
      type: "branch",
      direction: "horizontal",
      children: [
        { type: "leaf", groupId: "group-1" },
        { type: "leaf", groupId: "group-2" },
      ],
      sizes: [50, 50],
    },
    {
      "group-1": {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
      "group-2": {
        id: "group-2",
        tabs: [{ id: "tab-2", paneId: "pane-2" }],
        activeTabId: "tab-2",
      },
    },
  );

  expect(result.sourceGroupIds).toEqual(["group-1", "group-2"]);
  expect(result.tabs).toHaveLength(2);
  expect(result.tabs.map((tab) => tab.paneId)).toEqual(["pane-1", "pane-2"]);
  expect(result.tabs[0]?.id).not.toBe("tab-1");
  expect(result.tabs[1]?.id).not.toBe("tab-2");
});

test("removeWorkspaceFromSidebarState removes the workspace from both containers", () => {
  const result = removeWorkspaceFromSidebarState(
    [
      { type: "workspace", workspaceId: "ws-1" },
      { type: "workspace", workspaceId: "ws-2" },
    ],
    [{ type: "workspace", workspaceId: "ws-1" }],
    "ws-1",
  );

  expect(result.sidebarTree).toEqual([{ type: "workspace", workspaceId: "ws-2" }]);
  expect(result.pinnedSidebarNodes).toEqual([]);
});

test("removeWorkspaceGroupState drops pane groups, history, and traversal entries", () => {
  const result = removeWorkspaceGroupState(
    {
      "group-1": { id: "group-1", tabs: [], activeTabId: "" },
      "group-2": { id: "group-2", tabs: [], activeTabId: "" },
      "group-3": { id: "group-3", tabs: [], activeTabId: "" },
    },
    {
      "group-1": ["tab-1"],
      "group-2": ["tab-2"],
      "group-3": ["tab-3"],
    },
    {
      "group-1": { order: ["tab-1"], index: 0, updatedAt: 1 },
      "group-2": { order: ["tab-2"], index: 0, updatedAt: 1 },
    },
    ["group-1", "group-2"],
  );

  expect(result.paneGroups).toEqual({
    "group-3": { id: "group-3", tabs: [], activeTabId: "" },
  });
  expect(result.tabHistoryByGroupId).toEqual({ "group-3": ["tab-3"] });
  expect(result.recentTabTraversalByGroupId).toEqual({});
});

test("removeWorkspaceRecord removes only the targeted workspace", () => {
  const workspaces = [
    {
      id: "ws-1",
      name: "One",
      root: { type: "leaf" as const, groupId: "group-1" },
      focusedGroupId: "group-1",
      zoomedGroupId: null,
      lastActiveAt: 1,
    },
    {
      id: "ws-2",
      name: "Two",
      root: { type: "leaf" as const, groupId: "group-2" },
      focusedGroupId: "group-2",
      zoomedGroupId: null,
      lastActiveAt: 2,
    },
  ];

  expect(removeWorkspaceRecord(workspaces, "ws-1").map((workspace) => workspace.id)).toEqual([
    "ws-2",
  ]);
});

import { expect, test } from "vitest";
import {
  buildWorkspaceRemovalState,
  buildTransferredWorkspaceDestinationState,
  collectWorkspaceTabsForTransfer,
  removeTransferredWorkspaceSourceState,
  removeWorkspaceFromSidebarState,
  removeWorkspaceGroupState,
  removeWorkspacePaneState,
  removeWorkspaceRecord,
  resolveWorkspaceTransferContext,
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

test("removeWorkspacePaneState removes panes referenced by the workspace groups", () => {
  const result = removeWorkspacePaneState(
    {
      "pane-1": { id: "pane-1", type: "terminal", title: "Terminal", config: {} },
      "pane-2": {
        id: "pane-2",
        type: "browser",
        title: "Browser",
        config: { url: "https://example.com" },
      },
      "pane-3": { id: "pane-3", type: "editor", title: "Editor", config: {} },
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
    ["group-1", "group-2"],
  );

  expect(result.panes).toEqual({
    "pane-3": { id: "pane-3", type: "editor", title: "Editor", config: {} },
  });
  expect(result.removedPaneIds).toEqual(["pane-1", "pane-2"]);
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

test("removeTransferredWorkspaceSourceState removes source workspace records and switches focus when needed", () => {
  const result = removeTransferredWorkspaceSourceState({
    state: {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
        {
          id: "ws-2",
          name: "Two",
          root: { type: "leaf", groupId: "group-3" },
          focusedGroupId: "group-3",
          zoomedGroupId: null,
          lastActiveAt: 2,
        },
      ],
      activeWorkspaceId: "ws-1",
      sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
      pinnedSidebarNodes: [{ type: "workspace", workspaceId: "ws-1" }],
      paneGroups: {
        "group-1": { id: "group-1", tabs: [], activeTabId: "" },
        "group-2": { id: "group-2", tabs: [], activeTabId: "" },
        "group-3": { id: "group-3", tabs: [], activeTabId: "" },
      },
      tabHistoryByGroupId: {
        "group-1": ["tab-1"],
        "group-2": ["tab-2"],
        "group-3": ["tab-3"],
      },
      recentTabTraversalByGroupId: {
        "group-1": { order: ["tab-1"], index: 0, updatedAt: 1 },
      },
    },
    sourceWorkspaceId: "ws-1",
    sourceGroupIds: ["group-1", "group-2"],
    fallbackActiveWorkspaceId: "ws-2",
  });

  expect(result.workspaces.map((workspace) => workspace.id)).toEqual(["ws-2"]);
  expect(result.activeWorkspaceId).toBe("ws-2");
  expect(result.sidebarTree).toEqual([]);
  expect(result.pinnedSidebarNodes).toEqual([]);
  expect(result.paneGroups).toEqual({
    "group-3": { id: "group-3", tabs: [], activeTabId: "" },
  });
  expect(result.tabHistoryByGroupId).toEqual({ "group-3": ["tab-3"] });
  expect(result.recentTabTraversalByGroupId).toEqual({});
});

test("buildWorkspaceRemovalState removes workspace-owned state and picks the next active workspace", () => {
  const result = buildWorkspaceRemovalState(
    {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: {
            type: "branch",
            direction: "horizontal",
            children: [
              { type: "leaf", groupId: "group-1" },
              { type: "leaf", groupId: "group-2" },
            ],
            sizes: [50, 50],
          },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
        {
          id: "ws-2",
          name: "Two",
          root: { type: "leaf", groupId: "group-3" },
          focusedGroupId: "group-3",
          zoomedGroupId: null,
          lastActiveAt: 2,
        },
      ],
      activeWorkspaceId: "ws-1",
      panes: {
        "pane-1": { id: "pane-1", type: "terminal", title: "Terminal", config: {} },
        "pane-2": {
          id: "pane-2",
          type: "browser",
          title: "Browser",
          config: { url: "https://example.com" },
        },
        "pane-3": { id: "pane-3", type: "editor", title: "Editor", config: {} },
      },
      sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
      pinnedSidebarNodes: [{ type: "workspace", workspaceId: "ws-1" }],
      paneGroups: {
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
        "group-3": {
          id: "group-3",
          tabs: [{ id: "tab-3", paneId: "pane-3" }],
          activeTabId: "tab-3",
        },
      },
      tabHistoryByGroupId: {
        "group-1": ["tab-1"],
        "group-2": ["tab-2"],
        "group-3": ["tab-3"],
      },
      recentTabTraversalByGroupId: {
        "group-1": { order: ["tab-1"], index: 0, updatedAt: 1 },
      },
    },
    "ws-1",
  );

  expect(result).toBeTruthy();
  expect(result?.workspaces.map((workspace) => workspace.id)).toEqual(["ws-2"]);
  expect(result?.activeWorkspaceId).toBe("ws-2");
  expect(result?.removedPaneIds).toEqual(["pane-1", "pane-2"]);
  expect(result?.panes).toEqual({
    "pane-3": { id: "pane-3", type: "editor", title: "Editor", config: {} },
  });
  expect(result?.paneGroups).toEqual({
    "group-3": { id: "group-3", tabs: [{ id: "tab-3", paneId: "pane-3" }], activeTabId: "tab-3" },
  });
  expect(result?.tabHistoryByGroupId).toEqual({ "group-3": ["tab-3"] });
  expect(result?.recentTabTraversalByGroupId).toEqual({});
  expect(result?.sidebarTree).toEqual([]);
  expect(result?.pinnedSidebarNodes).toEqual([]);
});

test("buildTransferredWorkspaceDestinationState updates the destination group and removes the source workspace", () => {
  const result = buildTransferredWorkspaceDestinationState({
    state: {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
        {
          id: "ws-2",
          name: "Two",
          root: { type: "leaf", groupId: "group-2" },
          focusedGroupId: "group-2",
          zoomedGroupId: null,
          lastActiveAt: 2,
        },
      ],
      activeWorkspaceId: "ws-1",
      sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
      pinnedSidebarNodes: [],
      paneGroups: {
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
      tabHistoryByGroupId: {
        "group-1": ["tab-1"],
        "group-2": ["tab-2"],
      },
      recentTabTraversalByGroupId: {
        "group-1": { order: ["tab-1"], index: 0, updatedAt: 1 },
      },
    },
    group: {
      id: "group-2",
      tabs: [{ id: "tab-2", paneId: "pane-2" }],
      activeTabId: "tab-2",
    },
    tabs: [
      { id: "tab-2", paneId: "pane-2" },
      { id: "tab-3", paneId: "pane-1" },
    ],
    activeTabId: "tab-3",
    sourceWorkspaceId: "ws-1",
    sourceGroupIds: ["group-1"],
    fallbackActiveWorkspaceId: "ws-2",
  });

  expect(result.workspaces.map((workspace) => workspace.id)).toEqual(["ws-2"]);
  expect(result.activeWorkspaceId).toBe("ws-2");
  expect(result.paneGroups).toEqual({
    "group-2": {
      id: "group-2",
      tabs: [
        { id: "tab-2", paneId: "pane-2" },
        { id: "tab-3", paneId: "pane-1" },
      ],
      activeTabId: "tab-3",
    },
  });
  expect(result.tabHistoryByGroupId).toEqual({ "group-2": ["tab-3", "tab-2"] });
  expect(result.recentTabTraversalByGroupId).toEqual({});
  expect(result.sidebarTree).toEqual([]);
});

test("resolveWorkspaceTransferContext returns source/target workspace transfer details", () => {
  const result = resolveWorkspaceTransferContext(
    {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
        {
          id: "ws-2",
          name: "Two",
          root: { type: "leaf", groupId: "group-2" },
          focusedGroupId: "group-2",
          zoomedGroupId: null,
          lastActiveAt: 2,
        },
      ],
      paneGroups: {
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
    },
    "ws-1",
    "group-2",
  );

  expect(result?.sourceWorkspace.id).toBe("ws-1");
  expect(result?.targetWorkspace.id).toBe("ws-2");
  expect(result?.targetGroup.id).toBe("group-2");
  expect(result?.sourceGroupIds).toEqual(["group-1"]);
  expect(result?.tabs).toHaveLength(1);
  expect(result?.tabs[0]?.paneId).toBe("pane-1");
});

test("resolveWorkspaceTransferContext rejects same-workspace transfers", () => {
  const result = resolveWorkspaceTransferContext(
    {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: {
            type: "branch",
            direction: "horizontal",
            children: [
              { type: "leaf", groupId: "group-1" },
              { type: "leaf", groupId: "group-2" },
            ],
            sizes: [50, 50],
          },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
      ],
      paneGroups: {
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
    },
    "ws-1",
    "group-2",
  );

  expect(result).toBeNull();
});

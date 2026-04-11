import { expect, test } from "vitest";
import type { SourceGroupResolution } from "../lib/source-group-resolution";
import { buildPaneOwnersByPaneId } from "./pane-ownership";
import { applySourceGroupTabRemovalResolution } from "./source-group-state";
import { buildWorkspaceSidebarMetadataByWorkspaceId } from "./workspace-sidebar-metadata";

function createBaseState() {
  const state = {
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace 1",
        root: { type: "leaf" as const, groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 0,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", type: "terminal" as const, title: "Terminal", config: {} },
      "pane-2": {
        id: "pane-2",
        type: "browser" as const,
        title: "Browser",
        config: { url: "https://example.com" },
      },
      "pane-3": { id: "pane-3", type: "terminal" as const, title: "Terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        tabs: [
          { id: "tab-1", paneId: "pane-1" },
          { id: "tab-2", paneId: "pane-2" },
        ],
        activeTabId: "tab-2",
      },
    },
    tabHistoryByGroupId: {
      "group-1": ["tab-2", "tab-1"],
    },
    recentTabTraversalByGroupId: {
      "group-1": { order: ["tab-2", "tab-1"], index: 0, updatedAt: 1 },
    },
  };

  return {
    ...state,
    paneOwnersByPaneId: buildPaneOwnersByPaneId(state.workspaces, state.paneGroups),
    workspaceSidebarMetadataByWorkspaceId: buildWorkspaceSidebarMetadataByWorkspaceId(
      state.workspaces,
      state.panes,
      state.paneGroups,
    ),
  };
}

test("tabs-remaining updates the source group and tab history", () => {
  const state = createBaseState();
  const resolution: SourceGroupResolution = {
    kind: "tabs-remaining",
    srcGroup: {
      id: "group-1",
      tabs: [{ id: "tab-1", paneId: "pane-1" }],
      activeTabId: "tab-1",
    },
  };

  const nextState = applySourceGroupTabRemovalResolution({
    state,
    sourceWorkspaceId: "ws-1",
    sourceGroupId: "group-1",
    removedTabId: "tab-2",
    resolution,
  });

  expect(nextState.paneGroups["group-1"]).toEqual(resolution.srcGroup);
  expect(nextState.tabHistoryByGroupId["group-1"]).toEqual(["tab-1"]);
  expect(nextState.recentTabTraversalByGroupId["group-1"]).toBeUndefined();
});

test("group-removed deletes the source group and tab history by default", () => {
  const baseState = createBaseState();
  const state = {
    ...baseState,
    workspaces: [
      {
        ...baseState.workspaces[0]!,
        zoomedGroupId: "group-1" as string | null,
      },
    ],
  };
  const resolution: SourceGroupResolution = {
    kind: "group-removed",
    newRoot: { type: "leaf", groupId: "group-2" },
    newFocusedGroupId: "group-2",
  };

  const nextState = applySourceGroupTabRemovalResolution({
    state,
    sourceWorkspaceId: "ws-1",
    sourceGroupId: "group-1",
    removedTabId: "tab-2",
    resolution,
  });

  expect(nextState.paneGroups["group-1"]).toBeUndefined();
  expect(nextState.tabHistoryByGroupId["group-1"]).toBeUndefined();
  expect(nextState.workspaces[0]?.focusedGroupId).toBe("group-2");
  expect(nextState.workspaces[0]?.zoomedGroupId).toBeNull();
});

test("group-removed can preserve an empty tab history entry for close-tab flows", () => {
  const state = createBaseState();
  const resolution: SourceGroupResolution = {
    kind: "group-removed",
    newRoot: { type: "leaf", groupId: "group-2" },
    newFocusedGroupId: "group-2",
  };

  const nextState = applySourceGroupTabRemovalResolution({
    state,
    sourceWorkspaceId: "ws-1",
    sourceGroupId: "group-1",
    removedTabId: "tab-2",
    resolution,
    removedGroupTabHistoryMode: "empty",
  });

  expect(nextState.tabHistoryByGroupId["group-1"]).toEqual([]);
});

test("group-replaced-with-fallback adds the fallback pane and source group", () => {
  const state = createBaseState();
  const resolution: SourceGroupResolution = {
    kind: "group-replaced-with-fallback",
    srcGroup: {
      id: "group-1",
      tabs: [{ id: "tab-fallback", paneId: "pane-3" }],
      activeTabId: "tab-fallback",
    },
    fallbackPane: { id: "pane-3", type: "terminal", title: "Terminal", config: {} },
  };

  const nextState = applySourceGroupTabRemovalResolution({
    state,
    sourceWorkspaceId: "ws-1",
    sourceGroupId: "group-1",
    removedTabId: "tab-2",
    resolution,
  });

  expect(nextState.panes["pane-3"]).toEqual(resolution.fallbackPane);
  expect(nextState.paneGroups["group-1"]).toEqual(resolution.srcGroup);
  expect(nextState.tabHistoryByGroupId["group-1"]).toEqual(["tab-fallback"]);
});

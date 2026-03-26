import { test, expect } from "vitest";
import { cleanupPaneResources } from "../lib/pane-cleanup";
import {
  useWorkspaceStore,
  collectGroupIds,
  findParentOfGroup,
  removeGroupFromTree,
  findFirstGroupId,
  findSiblingGroupId,
  repairTree,
} from "./workspace-store";
import { findFolder } from "../lib/sidebar-tree";

/**
 * Reset the workspace store to a clean initial state suitable for tests.
 *
 * After reset the store has zero workspaces and empty maps — call
 * `addWorkspace()` to set up the fixture you need.
 */
function resetWorkspaceStore(): void {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: "",
    panes: {},
    paneGroups: {},
    pinnedSidebarNodes: [],
    sidebarTree: [],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shortcut: reset + add a workspace and return its id. */
function setupWorkspace(name = "Test Workspace"): string {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace(name);
  return useWorkspaceStore.getState().activeWorkspaceId;
}

/** Return the workspace object for `id`. */
function getWorkspace(id: string) {
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id);
}

function getLeafGroupIds(workspaceId: string): string[] {
  const workspace = getWorkspace(workspaceId);
  expect(workspace).toBeTruthy();
  return collectGroupIds(workspace!.root);
}

function setupFourGroupWorkspace(): { wsId: string; groupIds: string[] } {
  const wsId = setupWorkspace("Four Group Workspace");
  const workspace = getWorkspace(wsId);
  expect(workspace).toBeTruthy();
  const originalGroupId = workspace!.focusedGroupId;
  expect(originalGroupId).toBeTruthy();

  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId!, "horizontal");
  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId!, "vertical");

  const afterLeftSplit = getWorkspace(wsId);
  expect(afterLeftSplit).toBeTruthy();
  const groupIdsAfterLeftSplit = collectGroupIds(afterLeftSplit!.root);
  const rightGroupId = groupIdsAfterLeftSplit.find(
    (groupId) => groupId !== originalGroupId && groupId !== afterLeftSplit!.focusedGroupId,
  );
  expect(rightGroupId).toBeTruthy();

  useWorkspaceStore.getState().splitGroup(wsId, rightGroupId!, "vertical");

  return { wsId, groupIds: getLeafGroupIds(wsId) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("cleanupPaneResources destroys browser panes and clears runtime state", () => {
  const destroyedPaneIds: string[] = [];
  const clearedPaneIds: string[] = [];

  cleanupPaneResources(
    {
      "pane-1": {
        id: "pane-1",
        type: "browser",
        title: "Browser",
        config: { url: "https://example.com" },
      },
    },
    "pane-1",
    {
      destroyTerminal: () => {
        throw new Error("unexpected terminal cleanup");
      },
      destroyBrowser: (paneId) => {
        destroyedPaneIds.push(paneId);
      },
      destroyEditor: () => {
        throw new Error("unexpected editor cleanup");
      },
      destroyT3Code: () => {
        throw new Error("unexpected t3code cleanup");
      },
      clearBrowserRuntime: (paneId) => {
        clearedPaneIds.push(paneId);
      },
    },
  );

  expect(destroyedPaneIds).toEqual(["pane-1"]);
  expect(clearedPaneIds).toEqual(["pane-1"]);
});

test("updateBrowserPaneZoom persists zoom on browser pane config only", () => {
  const initialState = useWorkspaceStore.getState();
  const originalPanes = initialState.panes;

  useWorkspaceStore.setState({
    panes: {
      "pane-1": {
        id: "pane-1",
        type: "browser",
        title: "Browser",
        config: { url: "https://example.com", zoom: 1 },
      },
      "pane-2": {
        id: "pane-2",
        type: "terminal",
        title: "Terminal",
        config: {},
      },
    },
  });

  useWorkspaceStore.getState().updateBrowserPaneZoom("pane-1", 1.25);
  useWorkspaceStore.getState().updateBrowserPaneZoom("pane-2", 2);

  expect(useWorkspaceStore.getState().panes["pane-1"]?.config).toEqual({
    url: "https://example.com",
    zoom: 1.25,
  });
  expect(useWorkspaceStore.getState().panes["pane-2"]?.config).toEqual({});

  useWorkspaceStore.setState({ panes: originalPanes });
});

test("addGroupTab creates empty pane in group", () => {
  const wsId = setupWorkspace();
  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();

  const focusedGroupId = ws!.focusedGroupId;
  expect(focusedGroupId).toBeTruthy();

  const groupBefore = useWorkspaceStore.getState().paneGroups[focusedGroupId!];
  expect(groupBefore).toBeTruthy();
  const tabCountBefore = groupBefore!.tabs.length;

  useWorkspaceStore.getState().addGroupTab(wsId, focusedGroupId!);

  const groupAfter = useWorkspaceStore.getState().paneGroups[focusedGroupId!];
  expect(groupAfter).toBeTruthy();
  expect(groupAfter!.tabs.length).toBe(tabCountBefore + 1);

  // The new tab should be active
  const newTab = groupAfter!.tabs[groupAfter!.tabs.length - 1];
  expect(newTab).toBeTruthy();
  expect(groupAfter!.activeTabId).toBe(newTab!.id);

  // The new pane should exist and be an empty pane
  const newPane = useWorkspaceStore.getState().panes[newTab!.paneId];
  expect(newPane).toBeTruthy();
  expect(newPane!.type).toBe("empty");
  expect(newPane!.title).toBe("Empty");
});

test("removeGroupTab last tab with siblings removes group", () => {
  const wsId = setupWorkspace();
  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();

  const originalGroupId = ws!.focusedGroupId;
  expect(originalGroupId).toBeTruthy();

  // Split to create a second group
  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId!, "horizontal");

  const wsAfterSplit = getWorkspace(wsId);
  expect(wsAfterSplit).toBeTruthy();
  expect(wsAfterSplit!.root.type).toBe("branch");

  const allGroups = collectGroupIds(wsAfterSplit!.root);
  expect(allGroups.length).toBe(2);

  // The new group should be focused (splitGroup moves focus to new group)
  const newGroupId = wsAfterSplit!.focusedGroupId;
  expect(newGroupId).toBeTruthy();
  expect(newGroupId).not.toBe(originalGroupId);

  // Remove the only tab in the new group
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId!];
  expect(newGroup).toBeTruthy();
  expect(newGroup!.tabs.length).toBe(1);
  const tabToRemove = newGroup!.tabs[0];
  expect(tabToRemove).toBeTruthy();

  useWorkspaceStore.getState().removeGroupTab(wsId, newGroupId!, tabToRemove!.id);

  // After removal: the new group should be gone, tree collapses to single leaf
  const wsAfterRemove = getWorkspace(wsId);
  expect(wsAfterRemove).toBeTruthy();
  expect(wsAfterRemove!.root.type).toBe("leaf");

  if (wsAfterRemove!.root.type === "leaf") {
    expect(wsAfterRemove!.root.groupId).toBe(originalGroupId);
  }

  // The removed group should no longer exist in paneGroups
  expect(useWorkspaceStore.getState().paneGroups[newGroupId!]).toBe(undefined);

  // Focus should have transferred to the remaining group
  expect(wsAfterRemove!.focusedGroupId).toBe(originalGroupId);
});

test("removeGroupTab last tab without siblings adds empty", () => {
  const wsId = setupWorkspace();
  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();

  const groupId = ws!.focusedGroupId;
  expect(groupId).toBeTruthy();
  expect(ws!.root.type).toBe("leaf"); // single group, no siblings

  const group = useWorkspaceStore.getState().paneGroups[groupId!];
  expect(group).toBeTruthy();
  const tabToRemove = group!.tabs[0];
  expect(tabToRemove).toBeTruthy();
  const oldPaneId = tabToRemove!.paneId;

  useWorkspaceStore.getState().removeGroupTab(wsId, groupId!, tabToRemove!.id);

  // The group should still exist (only group — can't remove it)
  const groupAfter = useWorkspaceStore.getState().paneGroups[groupId!];
  expect(groupAfter).toBeTruthy();

  // It should have exactly 1 tab (the new empty replacement)
  expect(groupAfter!.tabs.length).toBe(1);
  const replacementTab = groupAfter!.tabs[0];
  expect(replacementTab).toBeTruthy();
  expect(groupAfter!.activeTabId).toBe(replacementTab!.id);

  // The replacement pane should be a new empty pane
  const replacementPane = useWorkspaceStore.getState().panes[replacementTab!.paneId];
  expect(replacementPane).toBeTruthy();
  expect(replacementPane!.type).toBe("empty");

  // The old pane should be removed
  expect(useWorkspaceStore.getState().panes[oldPaneId]).toBe(undefined);
});

test("splitGroup creates new group with empty pane", () => {
  const wsId = setupWorkspace();
  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();

  const originalGroupId = ws!.focusedGroupId;
  expect(originalGroupId).toBeTruthy();
  expect(ws!.root.type).toBe("leaf"); // starts as a single leaf

  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId!, "horizontal");

  const wsAfter = getWorkspace(wsId);
  expect(wsAfter).toBeTruthy();

  // Root should now be a branch with two leaf children
  expect(wsAfter!.root.type).toBe("branch");
  if (wsAfter!.root.type !== "branch") throw new Error("expected branch");

  expect(wsAfter!.root.direction).toBe("horizontal");
  expect(wsAfter!.root.children.length).toBe(2);
  expect(wsAfter!.root.sizes).toEqual([50, 50]);

  const [first, second] = wsAfter!.root.children;
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(first!.type).toBe("leaf");
  expect(second!.type).toBe("leaf");

  if (first!.type !== "leaf" || second!.type !== "leaf") {
    throw new Error("expected two leaves");
  }

  // First child retains the original group
  expect(first!.groupId).toBe(originalGroupId);

  // Second child is the new group
  const newGroupId = second!.groupId;
  expect(newGroupId).not.toBe(originalGroupId);

  // New group exists and has exactly 1 empty pane tab
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId];
  expect(newGroup).toBeTruthy();
  expect(newGroup!.tabs.length).toBe(1);

  const newPane = useWorkspaceStore.getState().panes[newGroup!.tabs[0]!.paneId];
  expect(newPane).toBeTruthy();
  expect(newPane!.type).toBe("empty");

  // Focus moved to the new group
  expect(wsAfter!.focusedGroupId).toBe(newGroupId);
});

test("closeGroup destroys all panes and removes group", () => {
  const wsId = setupWorkspace();
  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();

  const originalGroupId = ws!.focusedGroupId;
  expect(originalGroupId).toBeTruthy();

  // Split to create two groups
  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId!, "vertical");

  const wsAfterSplit = getWorkspace(wsId);
  expect(wsAfterSplit).toBeTruthy();

  const newGroupId = wsAfterSplit!.focusedGroupId;
  expect(newGroupId).toBeTruthy();
  expect(newGroupId).not.toBe(originalGroupId);

  // Record the pane IDs in the new group so we can verify they're cleaned up
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId!];
  expect(newGroup).toBeTruthy();
  const paneIdsInNewGroup = newGroup!.tabs.map((t) => t.paneId);

  // Close the new group
  useWorkspaceStore.getState().closeGroup(wsId, newGroupId!);

  const wsAfterClose = getWorkspace(wsId);
  expect(wsAfterClose).toBeTruthy();

  // Tree should collapse back to a single leaf
  expect(wsAfterClose!.root.type).toBe("leaf");
  if (wsAfterClose!.root.type === "leaf") {
    expect(wsAfterClose!.root.groupId).toBe(originalGroupId);
  }

  // The closed group should be removed from paneGroups
  expect(useWorkspaceStore.getState().paneGroups[newGroupId!]).toBe(undefined);

  // All panes from the closed group should be removed
  for (const paneId of paneIdsInNewGroup) {
    expect(useWorkspaceStore.getState().panes[paneId]).toBe(undefined);
  }

  // Focus should have moved to the remaining group
  expect(wsAfterClose!.focusedGroupId).toBe(originalGroupId);
});

test("migration from old format preserves panes", () => {
  // The migration function (migratePersistedState) is internal, so we test
  // the structural invariants it must produce by simulating the migrated
  // output and verifying the pure tree helpers operate correctly on it.
  //
  // Old format: workspace had `tabs: Tab[]`, each Tab with a `root` tree
  // where leaves had `paneId`. Migration converts this to:
  //   - workspace.root: SplitNode where leaves have `groupId`
  //   - workspace.focusedGroupId set to the first group
  //   - paneGroups: Record<string, PaneGroup> with entries for each leaf
  //   - inactive tab panes consolidated into the first group

  // Build a new-format tree matching what migration would produce from an
  // old workspace with an active tab containing a horizontal split of two
  // panes (pane-a, pane-b). Each old paneId leaf becomes a groupId leaf.
  const groupA = "group-for-pane-a";
  const groupB = "group-for-pane-b";
  const migratedRoot = {
    type: "branch" as const,
    direction: "horizontal" as const,
    children: [
      { type: "leaf" as const, groupId: groupA },
      { type: "leaf" as const, groupId: groupB },
    ],
    sizes: [50, 50],
  };

  // Verify tree helpers work correctly on the migrated tree structure
  expect(collectGroupIds(migratedRoot)).toEqual([groupA, groupB]);
  expect(findFirstGroupId(migratedRoot)).toBe(groupA);

  const parentA = findParentOfGroup(migratedRoot, groupA);
  expect(parentA).toBeTruthy();
  expect(parentA!.index).toBe(0);

  const siblingOfA = findSiblingGroupId(migratedRoot, groupA);
  expect(siblingOfA).toBe(groupB);

  // Remove groupA and verify tree simplifies to single leaf
  const afterRemove = removeGroupFromTree(migratedRoot, groupA);
  expect(afterRemove).toBeTruthy();
  expect(afterRemove!.type).toBe("leaf");
  if (afterRemove!.type === "leaf") {
    expect(afterRemove!.groupId).toBe(groupB);
  }

  // Verify a workspace with this migrated root would be structurally valid
  // by loading it into the store
  resetWorkspaceStore();

  const paneA = { id: "pane-a", type: "terminal" as const, title: "Terminal", config: {} };
  const paneB = {
    id: "pane-b",
    type: "browser" as const,
    title: "Browser",
    config: { url: "https://example.com" },
  };
  const paneC = { id: "pane-c", type: "editor" as const, title: "Editor", config: {} };

  // Simulate migrated pane groups — each old leaf gets its own group,
  // inactive tab panes (pane-c) are added as extra tabs in the first group
  const paneGroupA: import("../types/workspace").PaneGroup = {
    id: groupA,
    tabs: [
      { id: "tab-a", paneId: "pane-a" },
      { id: "tab-c", paneId: "pane-c" }, // consolidated from inactive tab
    ],
    activeTabId: "tab-a",
  };
  const paneGroupB: import("../types/workspace").PaneGroup = {
    id: groupB,
    tabs: [{ id: "tab-b", paneId: "pane-b" }],
    activeTabId: "tab-b",
  };

  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "ws-migrated",
        name: "Migrated Workspace",
        root: migratedRoot,
        focusedGroupId: groupA,
        pinned: false,
        lastActiveAt: Date.now(),
      },
    ],
    activeWorkspaceId: "ws-migrated",
    panes: {
      "pane-a": paneA,
      "pane-b": paneB,
      "pane-c": paneC,
    },
    paneGroups: {
      [groupA]: paneGroupA,
      [groupB]: paneGroupB,
    },
    sidebarTree: [{ type: "workspace", workspaceId: "ws-migrated" }],
  });

  // All original panes should be preserved
  const state = useWorkspaceStore.getState();
  expect(state.panes["pane-a"]).toBeTruthy();
  expect(state.panes["pane-b"]).toBeTruthy();
  expect(state.panes["pane-c"]).toBeTruthy();
  expect(state.panes["pane-a"]!.type).toBe("terminal");
  expect(state.panes["pane-b"]!.type).toBe("browser");
  expect(state.panes["pane-c"]!.type).toBe("editor");

  // The migrated workspace should have proper structure
  const ws = state.workspaces[0];
  expect(ws).toBeTruthy();
  expect(ws!.focusedGroupId).toBe(groupA);
  expect(ws!.root.type).toBe("branch");

  // First group should have the consolidated inactive tab pane
  expect(state.paneGroups[groupA]!.tabs.length).toBe(2);
  expect(state.paneGroups[groupA]!.tabs[1]!.paneId).toBe("pane-c");

  // Store operations should work on the migrated data (e.g. split, close)
  useWorkspaceStore.getState().splitGroup("ws-migrated", groupA, "vertical");
  const wsAfterSplit = useWorkspaceStore.getState().workspaces[0];
  expect(wsAfterSplit).toBeTruthy();
  const allGroups = collectGroupIds(wsAfterSplit!.root);
  expect(allGroups.length).toBe(3); // groupA, groupB, + new group from split
});

// ---------------------------------------------------------------------------
// sidebar organization & lastActiveAt tests
// ---------------------------------------------------------------------------

test("new workspaces have a recent lastActiveAt", () => {
  const before = Date.now();
  const wsId = setupWorkspace();
  const after = Date.now();

  const ws = getWorkspace(wsId);
  expect(ws).toBeTruthy();
  expect(ws!.lastActiveAt >= before).toBeTruthy();
  expect(ws!.lastActiveAt <= after).toBeTruthy();
});

test("pinWorkspace moves the workspace node from main tree to pinned nodes", () => {
  const wsId = setupWorkspace();

  useWorkspaceStore.getState().pinWorkspace(wsId);

  const state = useWorkspaceStore.getState();
  expect(state.pinnedSidebarNodes).toEqual([{ type: "workspace", workspaceId: wsId }]);
  expect(state.sidebarTree).toEqual([]);
});

test("unpinWorkspace moves the workspace node back to the root tree without duplication", () => {
  const wsId = setupWorkspace();
  useWorkspaceStore.getState().pinWorkspace(wsId);

  useWorkspaceStore.getState().unpinWorkspace(wsId);

  const state = useWorkspaceStore.getState();
  expect(state.pinnedSidebarNodes).toEqual([]);
  expect(state.sidebarTree).toEqual([{ type: "workspace", workspaceId: wsId }]);
});

test("pinFolder moves a folder node into pinned nodes", () => {
  const wsId = setupWorkspace();
  const folderId = useWorkspaceStore.getState().addFolder("Pinned Folder");

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: folderId,
    targetIndex: 0,
  });

  useWorkspaceStore.getState().pinFolder(folderId);

  const state = useWorkspaceStore.getState();
  expect(state.sidebarTree).toEqual([]);
  expect(state.pinnedSidebarNodes.length).toBe(1);
  expect(state.pinnedSidebarNodes[0]?.type).toBe("folder");
  if (state.pinnedSidebarNodes[0]?.type === "folder") {
    expect(state.pinnedSidebarNodes[0].id).toBe(folderId);
    expect(state.pinnedSidebarNodes[0].children).toEqual([
      { type: "workspace", workspaceId: wsId },
    ]);
  }
});

test("unpinFolder moves the folder node back to the main root", () => {
  const wsId = setupWorkspace();
  const folderId = useWorkspaceStore.getState().addFolder("Pinned Folder");

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: folderId,
    targetIndex: 0,
  });

  useWorkspaceStore.getState().pinFolder(folderId);
  useWorkspaceStore.getState().unpinFolder(folderId);

  const state = useWorkspaceStore.getState();
  expect(state.pinnedSidebarNodes).toEqual([]);
  expect(state.sidebarTree.length).toBe(1);
  expect(state.sidebarTree[0]?.type).toBe("folder");
});

test("addWorkspace with a parent folder inserts into that folder in its owning container", () => {
  resetWorkspaceStore();
  const folderId = useWorkspaceStore.getState().addFolder("Main Folder");

  useWorkspaceStore.getState().addWorkspace("Nested Workspace", folderId, "main");

  const folder = findFolder(useWorkspaceStore.getState().sidebarTree, folderId);
  expect(folder).toBeTruthy();
  expect(folder!.children.length).toBe(1);
  expect(folder!.children[0]).toEqual({
    type: "workspace",
    workspaceId: useWorkspaceStore.getState().activeWorkspaceId,
  });
});

test("moveSidebarNode moves a workspace from one folder to another", () => {
  const firstWsId = setupWorkspace("WS A");
  useWorkspaceStore.getState().addWorkspace("WS B");
  const secondWsId = useWorkspaceStore.getState().activeWorkspaceId;
  const sourceFolderId = useWorkspaceStore.getState().addFolder("Source Folder");
  const targetFolderId = useWorkspaceStore.getState().addFolder("Target Folder");

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: firstWsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: sourceFolderId,
    targetIndex: 0,
  });
  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: secondWsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: targetFolderId,
    targetIndex: 0,
  });

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: firstWsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: targetFolderId,
    targetIndex: 1,
  });

  const sourceFolder = findFolder(useWorkspaceStore.getState().sidebarTree, sourceFolderId);
  const targetFolder = findFolder(useWorkspaceStore.getState().sidebarTree, targetFolderId);
  expect(sourceFolder).toBeTruthy();
  expect(targetFolder).toBeTruthy();
  expect(sourceFolder!.children).toEqual([]);
  expect(targetFolder!.children).toEqual([
    { type: "workspace", workspaceId: secondWsId },
    { type: "workspace", workspaceId: firstWsId },
  ]);
});

test("moveSidebarNode moves a workspace from a folder back to root", () => {
  const wsId = setupWorkspace();
  const folderId = useWorkspaceStore.getState().addFolder("Folder");

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: folderId,
    targetIndex: 0,
  });

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: null,
    targetIndex: 1,
  });

  const state = useWorkspaceStore.getState();
  const folder = findFolder(state.sidebarTree, folderId);
  expect(folder).toBeTruthy();
  expect(folder!.children).toEqual([]);
  expect(state.sidebarTree[1]).toEqual({ type: "workspace", workspaceId: wsId });
});

test("moveSidebarNode adjusts same-parent downward reorders to the intended sibling position", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("WS A");
  const wsAId = useWorkspaceStore.getState().activeWorkspaceId;
  useWorkspaceStore.getState().addWorkspace("WS B");
  const wsBId = useWorkspaceStore.getState().activeWorkspaceId;
  useWorkspaceStore.getState().addWorkspace("WS C");
  const wsCId = useWorkspaceStore.getState().activeWorkspaceId;

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsAId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: null,
    targetIndex: 2,
  });

  expect(useWorkspaceStore.getState().sidebarTree).toEqual([
    { type: "workspace", workspaceId: wsBId },
    { type: "workspace", workspaceId: wsAId },
    { type: "workspace", workspaceId: wsCId },
  ]);
});

test("moveSidebarNode moves a workspace from pinned into a folder", () => {
  const wsId = setupWorkspace();
  const folderId = useWorkspaceStore.getState().addFolder("Folder");
  useWorkspaceStore.getState().pinWorkspace(wsId);

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "pinned",
    targetContainer: "main",
    targetParentId: folderId,
    targetIndex: 0,
  });

  const state = useWorkspaceStore.getState();
  expect(state.pinnedSidebarNodes).toEqual([]);
  const folder = findFolder(state.sidebarTree, folderId);
  expect(folder).toBeTruthy();
  expect(folder!.children).toEqual([{ type: "workspace", workspaceId: wsId }]);
});

test("moveSidebarNode rejects cyclic folder moves", () => {
  const wsId = setupWorkspace();
  const parentFolderId = useWorkspaceStore.getState().addFolder("Parent");
  const childFolderId = useWorkspaceStore.getState().addFolder("Child", parentFolderId);

  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: wsId,
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: childFolderId,
    targetIndex: 0,
  });

  const before = useWorkspaceStore.getState().sidebarTree;
  useWorkspaceStore.getState().moveSidebarNode({
    nodeId: parentFolderId,
    nodeType: "folder",
    sourceContainer: "main",
    targetContainer: "main",
    targetParentId: childFolderId,
    targetIndex: 1,
  });

  expect(useWorkspaceStore.getState().sidebarTree).toEqual(before);
});

test("setActiveWorkspace updates lastActiveAt", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("WS A");
  const wsAId = useWorkspaceStore.getState().activeWorkspaceId;

  useWorkspaceStore.getState().addWorkspace("WS B");
  const wsBId = useWorkspaceStore.getState().activeWorkspaceId;

  // Record lastActiveAt for WS A before switching
  const wsABefore = getWorkspace(wsAId);
  expect(wsABefore).toBeTruthy();
  // Small delay to ensure Date.now() advances
  const before = Date.now();
  useWorkspaceStore.getState().setActiveWorkspace(wsAId);
  const after = Date.now();

  const wsAAfter = getWorkspace(wsAId);
  expect(wsAAfter).toBeTruthy();
  expect(wsAAfter!.lastActiveAt >= before).toBeTruthy();
  expect(wsAAfter!.lastActiveAt <= after).toBeTruthy();

  // WS B's lastActiveAt should remain unchanged
  const wsBAfter = getWorkspace(wsBId);
  expect(wsBAfter).toBeTruthy();
  // WS B was not switched to, so its lastActiveAt should not have changed
  // (it was set when addWorkspace created it, and again when addWorkspace calls setActiveWorkspace implicitly via set)
});

// ── splitGroupWithTab ──

test("splitGroupWithTab splits target group and moves tab", () => {
  const wsId = setupWorkspace();
  const state = useWorkspaceStore.getState();
  const ws = state.workspaces.find((w) => w.id === wsId)!;
  const groupId = ws.root.type === "leaf" ? ws.root.groupId : "";

  // Add a second tab to the group
  useWorkspaceStore.getState().addGroupTab(wsId, groupId);
  const s2 = useWorkspaceStore.getState();
  const g2 = s2.paneGroups[groupId]!;
  expect(g2.tabs.length).toBe(2);

  const tabToMove = g2.tabs[1]!;

  // Split right: should create a new group to the right of the target
  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, "right");

  const s3 = useWorkspaceStore.getState();
  const ws3 = s3.workspaces.find((w) => w.id === wsId)!;
  expect(ws3.root.type).toBe("branch");
  if (ws3.root.type !== "branch") return;
  expect(ws3.root.direction).toBe("horizontal");
  expect(ws3.root.children.length).toBe(2);

  // Original group should have 1 tab remaining
  const origGroup = s3.paneGroups[groupId]!;
  expect(origGroup.tabs.length).toBe(1);

  // New group should have the moved tab
  const newChild = ws3.root.children[1]!;
  const newGroupId = newChild.type === "leaf" ? newChild.groupId : "";
  const newGroup = s3.paneGroups[newGroupId];
  expect(newGroup).toBeTruthy();
  expect(newGroup!.tabs.length).toBe(1);
  expect(newGroup!.tabs[0]!.paneId).toBe(tabToMove.paneId);

  // Focus should be on the new group
  expect(ws3.focusedGroupId).toBe(newGroupId);
});

test("splitGroupWithTab with left side puts new group first", () => {
  const wsId = setupWorkspace();
  const state = useWorkspaceStore.getState();
  const ws = state.workspaces.find((w) => w.id === wsId)!;
  const groupId = ws.root.type === "leaf" ? ws.root.groupId : "";

  // Add second tab
  useWorkspaceStore.getState().addGroupTab(wsId, groupId);
  const g = useWorkspaceStore.getState().paneGroups[groupId]!;
  const tabToMove = g.tabs[1]!;

  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, "left");

  const s = useWorkspaceStore.getState();
  const ws2 = s.workspaces.find((w) => w.id === wsId)!;
  expect(ws2.root.type).toBe("branch");
  if (ws2.root.type !== "branch") return;

  // New group should be FIRST child (left)
  const firstChild = ws2.root.children[0]!;
  const firstGroupId = firstChild.type === "leaf" ? firstChild.groupId : "";
  expect(firstGroupId).not.toBe(groupId);
  expect(ws2.focusedGroupId).toBe(firstGroupId);
});

test("splitGroupWithTab with single tab on same group populates src with empty pane", () => {
  const wsId = setupWorkspace();
  const state = useWorkspaceStore.getState();
  const ws = state.workspaces.find((w) => w.id === wsId)!;
  const groupId = ws.root.type === "leaf" ? ws.root.groupId : "";

  // Group has only 1 tab — split it onto itself
  const group = state.paneGroups[groupId]!;
  expect(group.tabs.length).toBe(1);
  const tabToMove = group.tabs[0]!;

  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, "right");

  const s = useWorkspaceStore.getState();
  const ws2 = s.workspaces.find((w) => w.id === wsId)!;
  expect(ws2.root.type).toBe("branch");
  if (ws2.root.type !== "branch") return;
  expect(ws2.root.direction).toBe("horizontal");
  expect(ws2.root.children.length).toBe(2);

  // The original group (left child) should still exist with an empty pane tab
  const leftChild = ws2.root.children[0]!;
  const leftGroupId = leftChild.type === "leaf" ? leftChild.groupId : "";
  expect(leftGroupId).toBe(groupId);
  const origGroup = s.paneGroups[groupId];
  expect(origGroup).toBeTruthy();
  expect(origGroup!.tabs.length).toBe(1);
  const emptyPane = s.panes[origGroup!.tabs[0]!.paneId];
  expect(emptyPane).toBeTruthy();
  expect(emptyPane!.type).toBe("empty");

  // The new group (right child) should have the moved tab's pane
  const rightChild = ws2.root.children[1]!;
  const rightGroupId = rightChild.type === "leaf" ? rightChild.groupId : "";
  expect(rightGroupId).not.toBe(groupId);
  const newGroup = s.paneGroups[rightGroupId];
  expect(newGroup).toBeTruthy();
  expect(newGroup!.tabs.length).toBe(1);
  expect(newGroup!.tabs[0]!.paneId).toBe(tabToMove.paneId);

  // Focus on the new group
  expect(ws2.focusedGroupId).toBe(rightGroupId);
});

test("splitGroupWithTab removes src group when last tab moved and multiple groups", () => {
  const wsId = setupWorkspace();
  const state = useWorkspaceStore.getState();
  const ws = state.workspaces.find((w) => w.id === wsId)!;
  const groupId = ws.root.type === "leaf" ? ws.root.groupId : "";

  // Split to create a second group
  useWorkspaceStore.getState().splitGroup(wsId, groupId, "horizontal");
  const s2 = useWorkspaceStore.getState();
  const ws2 = s2.workspaces.find((w) => w.id === wsId)!;
  expect(ws2.root.type).toBe("branch");
  if (ws2.root.type !== "branch") return;
  const secondChild = ws2.root.children[1]!;
  const secondGroupId = secondChild.type === "leaf" ? secondChild.groupId : "";

  // Now splitGroupWithTab: move the only tab from groupId to create a split on secondGroupId
  const srcGroup = s2.paneGroups[groupId]!;
  const tabToMove = srcGroup.tabs[0]!;

  useWorkspaceStore
    .getState()
    .splitGroupWithTab(wsId, groupId, tabToMove.id, secondGroupId, "bottom");

  const s3 = useWorkspaceStore.getState();
  // srcGroup should be gone from paneGroups
  expect(s3.paneGroups[groupId]).toBe(undefined);
  // Tree should be simplified (no more reference to groupId)
  const allIds = collectGroupIds(s3.workspaces.find((w) => w.id === wsId)!.root);
  expect(allIds.includes(groupId)).toBe(false);
});

// ── moveTabToWorkspace ──

test("moveTabToWorkspace moves tab from one workspace to another", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");
  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const destWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";
  const destGroupId = destWs.root.type === "leaf" ? destWs.root.groupId : "";

  // Add a second tab to source
  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId);
  const s2 = useWorkspaceStore.getState();
  const srcGroup = s2.paneGroups[srcGroupId]!;
  expect(srcGroup.tabs.length).toBe(2);
  const tabToMove = srcGroup.tabs[1]!;
  const movedPaneId = tabToMove.paneId;

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id);

  const s3 = useWorkspaceStore.getState();
  // Source group should have 1 tab
  expect(s3.paneGroups[srcGroupId]!.tabs.length).toBe(1);
  // Dest group should have 2 tabs (original empty + moved)
  expect(s3.paneGroups[destGroupId]!.tabs.length).toBe(2);
  // The moved pane should be in the dest group
  expect(s3.paneGroups[destGroupId]!.tabs.some((t) => t.paneId === movedPaneId)).toBeTruthy();
  // The pane itself should still exist in the global panes map
  expect(s3.panes[movedPaneId]).toBeTruthy();
});

test("moveTabToWorkspace collapses empty source group when multiple exist", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");
  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const destWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";

  // Create a split in source workspace
  useWorkspaceStore.getState().splitGroup(srcWs.id, srcGroupId, "horizontal");
  const s2 = useWorkspaceStore.getState();
  const srcWs2 = s2.workspaces.find((w) => w.id === srcWs.id)!;
  expect(srcWs2.root.type).toBe("branch");

  // Move the only tab from srcGroupId to dest workspace
  const srcGroup = s2.paneGroups[srcGroupId]!;
  const tabToMove = srcGroup.tabs[0]!;

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id);

  const s3 = useWorkspaceStore.getState();
  // Source group should be deleted from paneGroups
  expect(s3.paneGroups[srcGroupId]).toBe(undefined);
  // Source workspace tree should be simplified (single leaf)
  const srcWs3 = s3.workspaces.find((w) => w.id === srcWs.id)!;
  expect(srcWs3.root.type).toBe("leaf");
});

test("moveTabToWorkspace adds empty pane when only group becomes empty", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");
  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const destWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";

  // Source has only 1 group with 1 tab (default empty pane)
  // Add a real tab then move it
  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId);
  const s2 = useWorkspaceStore.getState();
  // Remove the first (empty) tab so we have just 1 tab
  const firstTab = s2.paneGroups[srcGroupId]!.tabs[0]!;
  useWorkspaceStore.getState().removeGroupTab(srcWs.id, srcGroupId, firstTab.id);

  const s3 = useWorkspaceStore.getState();
  const srcGroup = s3.paneGroups[srcGroupId]!;
  expect(srcGroup.tabs.length).toBe(1);
  const tabToMove = srcGroup.tabs[0]!;

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id);

  const s4 = useWorkspaceStore.getState();
  // Source group should still exist with an empty pane tab
  expect(s4.paneGroups[srcGroupId]).toBeTruthy();
  expect(s4.paneGroups[srcGroupId]!.tabs.length).toBe(1);
  const replacementPane = s4.panes[s4.paneGroups[srcGroupId]!.tabs[0]!.paneId]!;
  expect(replacementPane.type).toBe("empty");
});

// ── repairTree ──

test("repairTree removes orphaned leaves from branch", () => {
  const root = {
    type: "branch" as const,
    direction: "horizontal" as const,
    children: [
      { type: "leaf" as const, groupId: "valid-group" },
      { type: "leaf" as const, groupId: "orphan-group" },
    ],
    sizes: [50, 50],
  };
  const validGroups = new Set(["valid-group"]);
  const repaired = repairTree(root, validGroups);
  expect(repaired).toEqual({ type: "leaf", groupId: "valid-group" });
});

test("repairTree preserves valid tree unchanged", () => {
  const root = {
    type: "branch" as const,
    direction: "horizontal" as const,
    children: [
      { type: "leaf" as const, groupId: "g1" },
      { type: "leaf" as const, groupId: "g2" },
    ],
    sizes: [50, 50],
  };
  const validGroups = new Set(["g1", "g2"]);
  const repaired = repairTree(root, validGroups);
  expect(repaired).toEqual(root);
});

test("repairTree handles deeply nested orphans", () => {
  const root = {
    type: "branch" as const,
    direction: "horizontal" as const,
    children: [
      { type: "leaf" as const, groupId: "g1" },
      {
        type: "branch" as const,
        direction: "vertical" as const,
        children: [
          { type: "leaf" as const, groupId: "orphan1" },
          { type: "leaf" as const, groupId: "g2" },
        ],
        sizes: [50, 50],
      },
    ],
    sizes: [50, 50],
  };
  const validGroups = new Set(["g1", "g2"]);
  const repaired = repairTree(root, validGroups);
  expect(repaired).toBeTruthy();
  expect(repaired!.type).toBe("branch");
  if (repaired!.type === "branch") {
    expect(repaired!.children.length).toBe(2);
    expect(repaired!.children[0]).toEqual({ type: "leaf", groupId: "g1" });
    expect(repaired!.children[1]).toEqual({ type: "leaf", groupId: "g2" });
  }
});

test("repairTree returns null when all leaves orphaned", () => {
  const root = {
    type: "branch" as const,
    direction: "horizontal" as const,
    children: [
      { type: "leaf" as const, groupId: "orphan1" },
      { type: "leaf" as const, groupId: "orphan2" },
    ],
    sizes: [50, 50],
  };
  const validGroups = new Set<string>();
  const repaired = repairTree(root, validGroups);
  expect(repaired).toBe(null);
});

test("splitGroup ignores group ids that do not belong to the workspace", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("WS A");
  useWorkspaceStore.getState().addWorkspace("WS B");

  const state = useWorkspaceStore.getState();
  const wsA = state.workspaces[0]!;
  const wsB = state.workspaces[1]!;
  const wsAGroupId = wsA.root.type === "leaf" ? wsA.root.groupId : "";
  const wsBGroupId = wsB.root.type === "leaf" ? wsB.root.groupId : "";
  const paneGroupCountBefore = Object.keys(state.paneGroups).length;

  useWorkspaceStore.getState().splitGroup(wsA.id, wsBGroupId, "horizontal");

  const nextState = useWorkspaceStore.getState();
  const nextWsA = nextState.workspaces.find((workspace) => workspace.id === wsA.id);

  expect(nextWsA).toBeTruthy();
  expect(nextWsA!.root).toEqual(wsA.root);
  expect(nextWsA!.focusedGroupId).toBe(wsAGroupId);
  expect(Object.keys(nextState.paneGroups).length).toBe(paneGroupCountBefore);
});

test("setFocusedGroup ignores group ids outside the workspace tree", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("WS A");
  useWorkspaceStore.getState().addWorkspace("WS B");

  const state = useWorkspaceStore.getState();
  const wsA = state.workspaces[0]!;
  const wsB = state.workspaces[1]!;
  const wsAGroupId = wsA.root.type === "leaf" ? wsA.root.groupId : "";
  const wsBGroupId = wsB.root.type === "leaf" ? wsB.root.groupId : "";

  useWorkspaceStore.getState().setFocusedGroup(wsA.id, wsBGroupId);

  const nextWsA = useWorkspaceStore
    .getState()
    .workspaces.find((workspace) => workspace.id === wsA.id);
  expect(nextWsA).toBeTruthy();
  expect(nextWsA!.focusedGroupId).toBe(wsAGroupId);
});

test("moveTabToGroup ignores destination groups from another workspace", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");

  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const destWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";
  const destGroupId = destWs.root.type === "leaf" ? destWs.root.groupId : "";

  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId);
  const srcGroupBefore = useWorkspaceStore.getState().paneGroups[srcGroupId]!;
  const destGroupBefore = useWorkspaceStore.getState().paneGroups[destGroupId]!;
  const movedTab = srcGroupBefore.tabs[1]!;

  useWorkspaceStore.getState().moveTabToGroup(srcWs.id, srcGroupId, movedTab.id, destGroupId, 0);

  const nextState = useWorkspaceStore.getState();
  expect(nextState.paneGroups[srcGroupId]!.tabs.length).toBe(srcGroupBefore.tabs.length);
  expect(nextState.paneGroups[destGroupId]!.tabs.length).toBe(destGroupBefore.tabs.length);
  expect(nextState.paneGroups[srcGroupId]!.tabs.some((tab) => tab.id === movedTab.id)).toBeTruthy();
});

test("splitGroupWithTab ignores target groups outside the source workspace", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Other");

  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const otherWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";
  const otherGroupId = otherWs.root.type === "leaf" ? otherWs.root.groupId : "";

  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId);
  const srcGroupBefore = useWorkspaceStore.getState().paneGroups[srcGroupId]!;
  const tabToMove = srcGroupBefore.tabs[1]!;
  const paneGroupCountBefore = Object.keys(useWorkspaceStore.getState().paneGroups).length;

  useWorkspaceStore
    .getState()
    .splitGroupWithTab(srcWs.id, srcGroupId, tabToMove.id, otherGroupId, "right");

  const nextState = useWorkspaceStore.getState();
  const nextSrcWs = nextState.workspaces.find((workspace) => workspace.id === srcWs.id);
  expect(nextSrcWs).toBeTruthy();
  expect(nextSrcWs!.root).toEqual(srcWs.root);
  expect(nextState.paneGroups[srcGroupId]!.tabs.length).toBe(srcGroupBefore.tabs.length);
  expect(Object.keys(nextState.paneGroups).length).toBe(paneGroupCountBefore);
});

test("moveTabToWorkspace falls back to the first valid destination group when focus is invalid", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");

  const state = useWorkspaceStore.getState();
  const srcWs = state.workspaces[0]!;
  const destWs = state.workspaces[1]!;
  const srcGroupId = srcWs.root.type === "leaf" ? srcWs.root.groupId : "";
  const destGroupId = destWs.root.type === "leaf" ? destWs.root.groupId : "";

  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId);
  const tabToMove = useWorkspaceStore.getState().paneGroups[srcGroupId]!.tabs[1]!;

  useWorkspaceStore.setState({
    workspaces: useWorkspaceStore
      .getState()
      .workspaces.map((workspace) =>
        workspace.id === destWs.id ? { ...workspace, focusedGroupId: "missing-group" } : workspace,
      ),
  });

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id);

  const nextState = useWorkspaceStore.getState();
  expect(
    nextState.paneGroups[destGroupId]!.tabs.some((tab) => tab.paneId === tabToMove.paneId),
  ).toBeTruthy();
});

test("removeGroupTab on a nested last-tab group does not leave orphaned leaves", () => {
  const { wsId, groupIds } = setupFourGroupWorkspace();
  expect(groupIds.length).toBe(4);

  const removedGroupId = groupIds[groupIds.length - 1]!;
  const group = useWorkspaceStore.getState().paneGroups[removedGroupId];
  expect(group).toBeTruthy();
  expect(group!.tabs.length).toBe(1);

  useWorkspaceStore.getState().removeGroupTab(wsId, removedGroupId, group!.tabs[0]!.id);

  const remainingGroupIds = getLeafGroupIds(wsId);
  expect(remainingGroupIds.includes(removedGroupId)).toBe(false);
  expect(useWorkspaceStore.getState().paneGroups[removedGroupId]).toBe(undefined);
  for (const groupId of remainingGroupIds) {
    expect(useWorkspaceStore.getState().paneGroups[groupId]).toBeTruthy();
  }
});

test("moveTabToWorkspace from a nested last-tab group does not leave orphaned leaves", () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  useWorkspaceStore.getState().addWorkspace("Dest");

  resetWorkspaceStore();
  useWorkspaceStore.getState().addWorkspace("Source");
  const { wsId, groupIds } = setupFourGroupWorkspace();
  useWorkspaceStore.getState().addWorkspace("Dest");

  const sourceWsId = wsId;
  const destWorkspace = useWorkspaceStore
    .getState()
    .workspaces.find((workspace) => workspace.id !== sourceWsId);
  expect(destWorkspace).toBeTruthy();

  const removedGroupId = groupIds[groupIds.length - 1]!;
  const group = useWorkspaceStore.getState().paneGroups[removedGroupId];
  expect(group).toBeTruthy();

  useWorkspaceStore
    .getState()
    .moveTabToWorkspace(sourceWsId, removedGroupId, group!.tabs[0]!.id, destWorkspace!.id);

  const remainingGroupIds = getLeafGroupIds(sourceWsId);
  expect(remainingGroupIds.includes(removedGroupId)).toBe(false);
  expect(useWorkspaceStore.getState().paneGroups[removedGroupId]).toBe(undefined);
  for (const groupId of remainingGroupIds) {
    expect(useWorkspaceStore.getState().paneGroups[groupId]).toBeTruthy();
  }
});

test("closing both panes on the left side of a 2x2 layout collapses to the right column", () => {
  const { wsId, groupIds } = setupFourGroupWorkspace();
  expect(groupIds.length).toBe(4);

  const topLeftGroupId = groupIds[0]!;
  const bottomLeftGroupId = groupIds[1]!;
  const topRightGroupId = groupIds[2]!;
  const bottomRightGroupId = groupIds[3]!;
  const topLeftGroup = useWorkspaceStore.getState().paneGroups[topLeftGroupId];
  const bottomLeftGroup = useWorkspaceStore.getState().paneGroups[bottomLeftGroupId];
  expect(topLeftGroup).toBeTruthy();
  expect(bottomLeftGroup).toBeTruthy();

  useWorkspaceStore.getState().closeGroup(wsId, topLeftGroupId);
  useWorkspaceStore.getState().closeGroup(wsId, bottomLeftGroupId);

  const remainingGroupIds = getLeafGroupIds(wsId);
  expect(remainingGroupIds).toEqual([topRightGroupId, bottomRightGroupId]);
  expect(useWorkspaceStore.getState().paneGroups[topLeftGroupId]).toBe(undefined);
  expect(useWorkspaceStore.getState().paneGroups[bottomLeftGroupId]).toBe(undefined);
  expect(useWorkspaceStore.getState().paneGroups[topRightGroupId]).toBeTruthy();
  expect(useWorkspaceStore.getState().paneGroups[bottomRightGroupId]).toBeTruthy();

  const workspace = getWorkspace(wsId);
  expect(workspace).toBeTruthy();
  expect(workspace!.root).toEqual({
    type: "branch",
    direction: "vertical",
    children: [
      { type: "leaf", groupId: topRightGroupId },
      { type: "leaf", groupId: bottomRightGroupId },
    ],
    sizes: [50, 50],
  });
});

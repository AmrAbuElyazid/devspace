import { nanoid } from "nanoid";
import type {
  Pane,
  PaneGroup,
  PaneGroupTab,
  SplitDirection,
  SplitNode,
} from "../../types/workspace";
import {
  treeHasGroup,
  collectGroupIds,
  findFirstGroupId,
  replaceLeafInTree,
  removeGroupFromTree,
  simplifyTree,
} from "../../lib/split-tree";
import { createPane, createPaneWithInheritedConfig } from "../../lib/pane-factory";
import { resolveSourceGroupAfterTabRemoval } from "../../lib/source-group-resolution";
import { appendPaneToGroupState } from "../group-tab-append-state";
import { buildDestinationGroupState } from "../group-tab-destination-state";
import type { PaneCleanup } from "../store-helpers";
import { applySourceGroupTabRemovalResolution } from "../source-group-state";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type GroupTabsSlice = Pick<
  WorkspaceState,
  | "addGroupTab"
  | "removeGroupTab"
  | "setActiveGroupTab"
  | "reorderGroupTabs"
  | "moveTabToGroup"
  | "splitGroupWithTab"
  | "moveTabToWorkspace"
  | "openBrowserInGroup"
  | "openEditorTab"
>;

export function createGroupTabsSlice(
  set: StoreSet,
  get: StoreGet,
  cleanupPanes: PaneCleanup,
): GroupTabsSlice {
  return {
    addGroupTab(workspaceId, groupId, defaultType) {
      const state = get();
      const { paneGroups, panes, workspaces } = state;
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace || !treeHasGroup(workspace.root, groupId)) return;
      const group = paneGroups[groupId];
      if (!group) return;

      const paneType = defaultType ?? "terminal";
      const pane = createPaneWithInheritedConfig(paneType, panes, paneGroups, groupId, workspace);
      const appendedState = appendPaneToGroupState({
        state: { panes, paneGroups },
        group,
        pane,
        tabId: nanoid(),
      });

      set({ panes: appendedState.panes, paneGroups: appendedState.paneGroups });
      get().recordTabActivation(groupId, appendedState.newTab.id);
    },

    removeGroupTab(workspaceId, groupId, tabId) {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!treeHasGroup(ws.root, groupId)) return;

      const group = state.paneGroups[groupId];
      if (!group) return;

      const tab = group.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      cleanupPanes(state.panes, [tab.paneId]);
      const nextPanes = { ...state.panes };
      delete nextPanes[tab.paneId];

      const resolution = resolveSourceGroupAfterTabRemoval(ws, groupId, group, tabId);
      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId: workspaceId,
        sourceGroupId: groupId,
        removedTabId: tabId,
        resolution,
        nextPanes,
        removedGroupTabHistoryMode: "empty",
      });

      set(nextState);

      if (resolution.kind !== "group-removed" && resolution.srcGroup.activeTabId !== tabId) {
        get().recordTabActivation(groupId, resolution.srcGroup.activeTabId);
      }
    },

    setActiveGroupTab(workspaceId, groupId, tabId) {
      set((state) => {
        const workspace = state.workspaces.find((w) => w.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;
        const group = state.paneGroups[groupId];
        if (!group) return state;
        if (!group.tabs.some((tab) => tab.id === tabId)) return state;
        return {
          paneGroups: {
            ...state.paneGroups,
            [groupId]: { ...group, activeTabId: tabId },
          },
        };
      });
      get().recordTabActivation(groupId, tabId);
    },

    reorderGroupTabs(workspaceId, groupId, fromIndex, toIndex) {
      set((state) => {
        const workspace = state.workspaces.find((w) => w.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;
        const group = state.paneGroups[groupId];
        if (!group) return state;

        const tabs = [...group.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        if (!moved) return state;
        tabs.splice(toIndex, 0, moved);

        return {
          paneGroups: {
            ...state.paneGroups,
            [groupId]: { ...group, tabs },
          },
        };
      });
    },

    moveTabToGroup(workspaceId, srcGroupId, tabId, destGroupId, insertIndex) {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!treeHasGroup(ws.root, srcGroupId) || !treeHasGroup(ws.root, destGroupId)) return;

      const srcGroup = state.paneGroups[srcGroupId];
      const destGroup = state.paneGroups[destGroupId];
      if (!srcGroup || !destGroup) return;
      if (srcGroupId === destGroupId) return;

      const tab = srcGroup.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const destTabs = [...destGroup.tabs];
      const idx =
        insertIndex !== undefined ? Math.min(insertIndex, destTabs.length) : destTabs.length;
      destTabs.splice(idx, 0, tab);

      const destinationState = buildDestinationGroupState({
        state,
        group: destGroup,
        tabs: destTabs,
        activeTabId: tab.id,
      });

      const resolution = resolveSourceGroupAfterTabRemoval(
        ws,
        srcGroupId,
        srcGroup,
        tabId,
        destGroupId,
      );
      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId: workspaceId,
        sourceGroupId: srcGroupId,
        removedTabId: tabId,
        resolution,
        nextPaneGroups: destinationState.paneGroups,
        nextTabHistoryByGroupId: destinationState.tabHistoryByGroupId,
        nextRecentTabTraversalByGroupId: destinationState.recentTabTraversalByGroupId,
      });

      set(nextState);
    },

    splitGroupWithTab(workspaceId, srcGroupId, tabId, targetGroupId, side) {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!treeHasGroup(ws.root, srcGroupId) || !treeHasGroup(ws.root, targetGroupId)) return;

      const srcGroup = state.paneGroups[srcGroupId];
      if (!srcGroup || !state.paneGroups[targetGroupId]) return;

      const tab = srcGroup.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Create new group containing only the moved tab
      const newTabId = nanoid();
      const newGroup: PaneGroup = {
        id: nanoid(),
        tabs: [{ id: newTabId, paneId: tab.paneId }],
        activeTabId: newTabId,
      };

      // Build the split: direction from side, child order from side
      const direction: SplitDirection =
        side === "left" || side === "right" ? "horizontal" : "vertical";
      const newLeaf: SplitNode = { type: "leaf", groupId: newGroup.id };
      const targetLeaf: SplitNode = { type: "leaf", groupId: targetGroupId };
      const children: SplitNode[] =
        side === "left" || side === "top" ? [newLeaf, targetLeaf] : [targetLeaf, newLeaf];

      const replacement: SplitNode = {
        type: "branch",
        direction,
        children,
        sizes: [50, 50],
      };

      let newRoot = replaceLeafInTree(ws.root, targetGroupId, replacement);
      const destinationState = buildDestinationGroupState({
        state,
        group: newGroup,
        tabs: newGroup.tabs,
        activeTabId: newGroup.activeTabId,
      });
      const resolution = resolveSourceGroupAfterTabRemoval(ws, srcGroupId, srcGroup, tabId);
      if (resolution.kind === "group-removed") {
        const cleaned = removeGroupFromTree(newRoot, srcGroupId);
        newRoot = cleaned ? simplifyTree(cleaned) : newRoot;
      }

      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId: workspaceId,
        sourceGroupId: srcGroupId,
        removedTabId: tabId,
        resolution,
        nextWorkspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, root: newRoot, focusedGroupId: newGroup.id } : w,
        ),
        nextPaneGroups: destinationState.paneGroups,
        nextTabHistoryByGroupId: destinationState.tabHistoryByGroupId,
        nextRecentTabTraversalByGroupId: destinationState.recentTabTraversalByGroupId,
      });

      set(nextState);
    },

    moveTabToWorkspace(srcWorkspaceId, srcGroupId, tabId, destWorkspaceId) {
      const state = get();
      const srcWs = state.workspaces.find((w) => w.id === srcWorkspaceId);
      const destWs = state.workspaces.find((w) => w.id === destWorkspaceId);
      if (!srcWs || !destWs || srcWorkspaceId === destWorkspaceId) return;
      if (!treeHasGroup(srcWs.root, srcGroupId)) return;

      const srcGroup = state.paneGroups[srcGroupId];
      if (!srcGroup) return;

      const tab = srcGroup.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Find destination group
      const destGroupId =
        destWs.focusedGroupId && treeHasGroup(destWs.root, destWs.focusedGroupId)
          ? destWs.focusedGroupId
          : findFirstGroupId(destWs.root);
      if (!destGroupId) return;
      const destGroup = state.paneGroups[destGroupId];
      if (!destGroup) return;

      // Add tab to destination group (new PaneGroupTab referencing same paneId)
      const newTab: PaneGroupTab = { id: nanoid(), paneId: tab.paneId };
      const destTabs = [...destGroup.tabs, newTab];

      const destinationState = buildDestinationGroupState({
        state,
        group: destGroup,
        tabs: destTabs,
        activeTabId: newTab.id,
      });

      const resolution = resolveSourceGroupAfterTabRemoval(srcWs, srcGroupId, srcGroup, tabId);
      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId: srcWorkspaceId,
        sourceGroupId: srcGroupId,
        removedTabId: tabId,
        resolution,
        nextPaneGroups: destinationState.paneGroups,
        nextTabHistoryByGroupId: destinationState.tabHistoryByGroupId,
        nextRecentTabTraversalByGroupId: destinationState.recentTabTraversalByGroupId,
      });

      set(nextState);
    },

    openBrowserInGroup(workspaceId, groupId, url) {
      const pane = createPane("browser", { url });
      const tabId = nanoid();
      set((state) => {
        const workspace = state.workspaces.find((w) => w.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;
        const group = state.paneGroups[groupId];
        if (!group) return state;
        const appendedState = appendPaneToGroupState({
          state,
          group,
          pane,
          tabId,
        });
        return {
          panes: appendedState.panes,
          paneGroups: appendedState.paneGroups,
        };
      });
      get().recordTabActivation(groupId, tabId);
    },

    openEditorTab(folderPath) {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (!ws) return;

      const groupId = ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
      if (!groupId) return;
      const group = state.paneGroups[groupId];
      if (!group) return;

      const folderName = folderPath.split("/").pop() || folderPath;
      const pane: Pane = {
        id: nanoid(),
        type: "editor",
        title: `VS Code: ${folderName}`,
        config: { folderPath },
      };
      const appendedState = appendPaneToGroupState({
        state,
        group,
        pane,
        tabId: nanoid(),
      });

      set({
        panes: appendedState.panes,
        paneGroups: appendedState.paneGroups,
        workspaces: state.workspaces.map((w) =>
          w.id === state.activeWorkspaceId ? { ...w, lastActiveAt: Date.now() } : w,
        ),
      });
      get().recordTabActivation(groupId, appendedState.newTab.id);
    },
  };
}

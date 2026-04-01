import { nanoid } from "nanoid";
import type {
  Pane,
  PaneGroup,
  PaneGroupTab,
  SplitDirection,
  SplitNode,
} from "../../types/workspace";
import {
  collectGroupIds,
  treeHasGroup,
  findFirstGroupId,
  replaceLeafInTree,
  removeGroupFromTree,
  simplifyTree,
} from "../../lib/split-tree";
import { createPane, findNearestTerminalCwd } from "../../lib/pane-factory";
import { resolveSourceGroupAfterTabRemoval } from "../../lib/source-group-resolution";
import type { PaneCleanup } from "../store-helpers";
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
      // Inherit CWD from the nearest terminal (same group → focused group → workspace.lastTerminalCwd → $HOME)
      let inheritedConfig: Partial<import("../../types/workspace").PaneConfig> | undefined;
      if (paneType === "terminal") {
        const cwd = findNearestTerminalCwd(panes, paneGroups, groupId, workspace);
        if (cwd) inheritedConfig = { cwd };
      } else if (paneType === "note") {
        inheritedConfig = { noteId: nanoid() };
      }
      const pane = createPane(paneType, inheritedConfig);
      const newTab: PaneGroupTab = { id: nanoid(), paneId: pane.id };

      set({
        panes: { ...panes, [pane.id]: pane },
        paneGroups: {
          ...paneGroups,
          [groupId]: {
            ...group,
            tabs: [...group.tabs, newTab],
            activeTabId: newTab.id,
          },
        },
      });
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
      const newPanes = { ...state.panes };
      delete newPanes[tab.paneId];

      // Resolve source group after tab removal
      const newPaneGroups = { ...state.paneGroups };
      const resolution = resolveSourceGroupAfterTabRemoval(ws, groupId, group, tabId);
      switch (resolution.kind) {
        case "tabs-remaining":
          newPaneGroups[groupId] = resolution.srcGroup;
          set({ panes: newPanes, paneGroups: newPaneGroups });
          break;
        case "group-removed":
          delete newPaneGroups[groupId];
          set({
            workspaces: state.workspaces.map((w) =>
              w.id === workspaceId
                ? {
                    ...w,
                    root: resolution.newRoot,
                    focusedGroupId: resolution.newFocusedGroupId,
                  }
                : w,
            ),
            panes: newPanes,
            paneGroups: newPaneGroups,
          });
          break;
        case "group-replaced-with-fallback":
          newPanes[resolution.fallbackPane.id] = resolution.fallbackPane;
          newPaneGroups[groupId] = resolution.srcGroup;
          set({ panes: newPanes, paneGroups: newPaneGroups });
          break;
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

      const newPaneGroups = { ...state.paneGroups };
      let newWorkspaces = state.workspaces;
      let newPanes = state.panes;

      // Update destination group
      newPaneGroups[destGroupId] = {
        ...destGroup,
        tabs: destTabs,
        activeTabId: tab.id,
      };

      // Resolve source group after tab removal
      const resolution = resolveSourceGroupAfterTabRemoval(
        ws,
        srcGroupId,
        srcGroup,
        tabId,
        destGroupId,
      );
      switch (resolution.kind) {
        case "tabs-remaining":
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
        case "group-removed":
          delete newPaneGroups[srcGroupId];
          newWorkspaces = state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, root: resolution.newRoot, focusedGroupId: resolution.newFocusedGroupId }
              : w,
          );
          break;
        case "group-replaced-with-fallback":
          newPanes = { ...state.panes, [resolution.fallbackPane.id]: resolution.fallbackPane };
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
      }

      set({
        workspaces: newWorkspaces,
        panes: newPanes,
        paneGroups: newPaneGroups,
      });
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
      const newPaneGroups = { ...state.paneGroups, [newGroup.id]: newGroup };
      let newWorkspaces = state.workspaces;
      let newPanes = state.panes;

      // Resolve source group after tab removal.
      const resolution = resolveSourceGroupAfterTabRemoval(ws, srcGroupId, srcGroup, tabId);
      switch (resolution.kind) {
        case "tabs-remaining":
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
        case "group-removed":
          {
            const cleaned = removeGroupFromTree(newRoot, srcGroupId);
            newRoot = cleaned ? simplifyTree(cleaned) : newRoot;
          }
          delete newPaneGroups[srcGroupId];
          break;
        case "group-replaced-with-fallback":
          newPanes = { ...state.panes, [resolution.fallbackPane.id]: resolution.fallbackPane };
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
      }

      newWorkspaces = state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, root: newRoot, focusedGroupId: newGroup.id } : w,
      );

      set({
        workspaces: newWorkspaces,
        panes: newPanes,
        paneGroups: newPaneGroups,
      });
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

      const newPaneGroups = {
        ...state.paneGroups,
        [destGroupId]: { ...destGroup, tabs: destTabs, activeTabId: newTab.id },
      };

      // Resolve source group after tab removal
      let newWorkspaces = state.workspaces;
      let newPanes = state.panes;

      const resolution = resolveSourceGroupAfterTabRemoval(srcWs, srcGroupId, srcGroup, tabId);
      switch (resolution.kind) {
        case "tabs-remaining":
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
        case "group-removed":
          delete newPaneGroups[srcGroupId];
          newWorkspaces = state.workspaces.map((w) =>
            w.id === srcWorkspaceId
              ? { ...w, root: resolution.newRoot, focusedGroupId: resolution.newFocusedGroupId }
              : w,
          );
          break;
        case "group-replaced-with-fallback":
          newPanes = { ...state.panes, [resolution.fallbackPane.id]: resolution.fallbackPane };
          newPaneGroups[srcGroupId] = resolution.srcGroup;
          break;
      }

      set({
        workspaces: newWorkspaces,
        panes: newPanes,
        paneGroups: newPaneGroups,
      });
    },

    openBrowserInGroup(workspaceId, groupId, url) {
      const pane = createPane("browser", { url });
      const newTab: PaneGroupTab = { id: nanoid(), paneId: pane.id };
      set((state) => {
        const workspace = state.workspaces.find((w) => w.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;
        const group = state.paneGroups[groupId];
        if (!group) return state;
        return {
          panes: { ...state.panes, [pane.id]: pane },
          paneGroups: {
            ...state.paneGroups,
            [groupId]: {
              ...group,
              tabs: [...group.tabs, newTab],
              activeTabId: newTab.id,
            },
          },
        };
      });
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
      const newTab: PaneGroupTab = { id: nanoid(), paneId: pane.id };

      set({
        panes: { ...state.panes, [pane.id]: pane },
        paneGroups: {
          ...state.paneGroups,
          [groupId]: {
            ...group,
            tabs: [...group.tabs, newTab],
            activeTabId: newTab.id,
          },
        },
        workspaces: state.workspaces.map((w) =>
          w.id === state.activeWorkspaceId ? { ...w, lastActiveAt: Date.now() } : w,
        ),
      });
    },
  };
}

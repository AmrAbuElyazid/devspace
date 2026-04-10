import { nanoid } from "nanoid";
import type { PaneGroup, SplitDirection, SplitNode } from "../../types/workspace";
import { removeSidebarNode, insertSidebarNode } from "../../lib/sidebar-tree";
import { collectGroupIds, treeHasGroup, replaceLeafInTree } from "../../lib/split-tree";
import {
  createPane,
  createPaneGroup,
  nextWorkspaceName,
  createDefaultWorkspace,
  findNearestTerminalCwd,
} from "../../lib/pane-factory";
import { resolveSourceGroupAfterTabRemoval } from "../../lib/source-group-resolution";
import { getSidebarNodesForContainer } from "../store-helpers";
import { buildRecentTabOrder, clearRecentTabTraversal } from "../tab-history";
import type { PaneCleanup } from "../store-helpers";
import { applySourceGroupTabRemovalResolution } from "../source-group-state";
import {
  collectWorkspaceTabsForTransfer,
  removeWorkspaceFromSidebarState,
  removeWorkspaceGroupState,
  removeWorkspaceRecord,
} from "../workspace-transfer-state";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type WorkspaceCrudSlice = Pick<
  WorkspaceState,
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "setActiveWorkspace"
  | "setFocusedGroup"
  | "mergeWorkspaceIntoGroup"
  | "splitGroupWithWorkspace"
  | "createWorkspaceFromTab"
>;

export function createWorkspaceCrudSlice(
  set: StoreSet,
  get: StoreGet,
  cleanupPanes: PaneCleanup,
): WorkspaceCrudSlice {
  return {
    addWorkspace: (name, parentFolderId = null, container = "main", defaultType) => {
      const paneType = defaultType ?? "terminal";
      // Inherit CWD from the currently focused terminal in the active workspace
      const currentState = get();
      const activeWs = currentState.workspaces.find((w) => w.id === currentState.activeWorkspaceId);
      let inheritedConfig: Partial<import("../../types/workspace").PaneConfig> | undefined;
      if (paneType === "terminal") {
        const cwd = findNearestTerminalCwd(
          currentState.panes,
          currentState.paneGroups,
          activeWs?.focusedGroupId ?? undefined,
          activeWs,
        );
        if (cwd) inheritedConfig = { cwd };
      } else if (paneType === "note") {
        inheritedConfig = { noteId: nanoid() };
      }
      const pane = createPane(paneType, inheritedConfig);
      const group = createPaneGroup(pane);
      const wsName = name ?? nextWorkspaceName(get().workspaces);
      const ws = createDefaultWorkspace(wsName, group);
      if (activeWs?.lastTerminalCwd) {
        ws.lastTerminalCwd = activeWs.lastTerminalCwd;
      }
      set((state) => {
        const targetNodes = getSidebarNodesForContainer(state, container);
        const insertedNodes = insertSidebarNode(
          targetNodes,
          { type: "workspace" as const, workspaceId: ws.id },
          parentFolderId,
          0,
        );

        return {
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
          panes: { ...state.panes, [pane.id]: pane },
          paneGroups: { ...state.paneGroups, [group.id]: group },
          sidebarTree: container === "main" ? insertedNodes : state.sidebarTree,
          pinnedSidebarNodes: container === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
          pendingEditId: ws.id,
          pendingEditType: "workspace" as const,
        };
      });
      return ws.id;
    },

    removeWorkspace: (id) => {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === id);
      if (!ws) return;

      // Collect all group IDs and clean up all panes in each group
      const groupIds = collectGroupIds(ws.root);
      const newPanes = { ...state.panes };
      const newPaneGroups = { ...state.paneGroups };
      const paneIdsToCleanup: string[] = [];

      for (const gid of groupIds) {
        const group = newPaneGroups[gid];
        if (group) {
          for (const tab of group.tabs) {
            paneIdsToCleanup.push(tab.paneId);
            delete newPanes[tab.paneId];
          }
          delete newPaneGroups[gid];
        }
      }

      cleanupPanes(state.panes, paneIdsToCleanup);

      const [newTree] = removeSidebarNode(state.sidebarTree, id, "workspace");
      const [newPinnedTree] = removeSidebarNode(state.pinnedSidebarNodes, id, "workspace");
      const remaining = state.workspaces.filter((w) => w.id !== id);

      if (remaining.length === 0) {
        const newPane = createPane("terminal");
        const newGroup = createPaneGroup(newPane);
        const newWs = createDefaultWorkspace("Workspace 1", newGroup);
        newPanes[newPane.id] = newPane;
        newPaneGroups[newGroup.id] = newGroup;
        set({
          workspaces: [newWs],
          activeWorkspaceId: newWs.id,
          panes: newPanes,
          paneGroups: newPaneGroups,
          pinnedSidebarNodes: [],
          sidebarTree: [...newTree, { type: "workspace" as const, workspaceId: newWs.id }],
          tabHistoryByGroupId: {},
          recentTabTraversalByGroupId: {},
        });
        return;
      }

      const nextTabHistoryByGroupId = { ...state.tabHistoryByGroupId };
      const nextRecentTabTraversalByGroupId = { ...state.recentTabTraversalByGroupId };
      for (const gid of groupIds) {
        delete nextTabHistoryByGroupId[gid];
        delete nextRecentTabTraversalByGroupId[gid];
      }

      let newActiveId = state.activeWorkspaceId;
      if (newActiveId === id) {
        const oldIndex = state.workspaces.findIndex((w) => w.id === id);
        newActiveId = remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? remaining[0]!.id;
      }

      set({
        workspaces: remaining,
        activeWorkspaceId: newActiveId,
        panes: newPanes,
        paneGroups: newPaneGroups,
        pinnedSidebarNodes: newPinnedTree,
        sidebarTree: newTree,
        tabHistoryByGroupId: nextTabHistoryByGroupId,
        recentTabTraversalByGroupId: nextRecentTabTraversalByGroupId,
      });
    },

    renameWorkspace(id, name) {
      set((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
      }));
    },

    setActiveWorkspace(id) {
      set((state) => ({
        activeWorkspaceId: id,
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, lastActiveAt: Date.now() } : w,
        ),
      }));
    },

    setFocusedGroup(workspaceId, groupId) {
      set((state) => {
        const workspace = state.workspaces.find((w) => w.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;
        return {
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, focusedGroupId: groupId } : w,
          ),
        };
      });
    },

    mergeWorkspaceIntoGroup(sourceWorkspaceId, targetGroupId) {
      const state = get();
      const sourceWs = state.workspaces.find((w) => w.id === sourceWorkspaceId);
      if (!sourceWs) return;

      const targetGroup = state.paneGroups[targetGroupId];
      if (!targetGroup) return;

      // Find which workspace contains the target group
      const targetWs = state.workspaces.find((w) => treeHasGroup(w.root, targetGroupId));
      if (!targetWs) return;

      // Guard: source must not be the same workspace as target
      if (sourceWs.id === targetWs.id) return;

      const { sourceGroupIds, tabs: allSourceTabs } = collectWorkspaceTabsForTransfer(
        sourceWs.root,
        state.paneGroups,
      );

      // Append new tabs to target group, set last as active
      const lastNewTab = allSourceTabs[allSourceTabs.length - 1];
      const mergedTabs = [...targetGroup.tabs, ...allSourceTabs];
      const {
        paneGroups: nextPaneGroups,
        tabHistoryByGroupId,
        recentTabTraversalByGroupId,
      } = removeWorkspaceGroupState(
        {
          ...state.paneGroups,
          [targetGroupId]: {
            ...targetGroup,
            tabs: mergedTabs,
            activeTabId: lastNewTab?.id ?? targetGroup.activeTabId,
          },
        },
        {
          ...state.tabHistoryByGroupId,
          [targetGroupId]: buildRecentTabOrder(
            state.tabHistoryByGroupId[targetGroupId],
            mergedTabs,
            lastNewTab?.id ?? targetGroup.activeTabId,
          ),
        },
        clearRecentTabTraversal(state.recentTabTraversalByGroupId, targetGroupId),
        sourceGroupIds,
      );
      const nextSidebarState = removeWorkspaceFromSidebarState(
        state.sidebarTree,
        state.pinnedSidebarNodes,
        sourceWorkspaceId,
      );

      // If source was active, switch to target workspace
      const newActiveId =
        state.activeWorkspaceId === sourceWorkspaceId ? targetWs.id : state.activeWorkspaceId;

      set({
        workspaces: removeWorkspaceRecord(state.workspaces, sourceWorkspaceId),
        activeWorkspaceId: newActiveId,
        paneGroups: nextPaneGroups,
        sidebarTree: nextSidebarState.sidebarTree,
        pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
        tabHistoryByGroupId,
        recentTabTraversalByGroupId,
      });
    },

    splitGroupWithWorkspace(sourceWorkspaceId, targetGroupId, side) {
      const state = get();
      const sourceWs = state.workspaces.find((w) => w.id === sourceWorkspaceId);
      if (!sourceWs) return;

      const targetGroup = state.paneGroups[targetGroupId];
      if (!targetGroup) return;

      // Find which workspace contains the target group
      const targetWs = state.workspaces.find((w) => treeHasGroup(w.root, targetGroupId));
      if (!targetWs) return;

      // Guard: source must not be the same workspace as target
      if (sourceWs.id === targetWs.id) return;

      const { sourceGroupIds, tabs: allSourceTabs } = collectWorkspaceTabsForTransfer(
        sourceWs.root,
        state.paneGroups,
      );

      // Create a new PaneGroup with all collected tabs
      const lastTab = allSourceTabs[allSourceTabs.length - 1];
      const newGroup: PaneGroup = {
        id: nanoid(),
        tabs: allSourceTabs,
        activeTabId: lastTab?.id ?? "",
      };

      // Build the split
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

      const newRoot = replaceLeafInTree(targetWs.root, targetGroupId, replacement);

      const {
        paneGroups: nextPaneGroups,
        tabHistoryByGroupId,
        recentTabTraversalByGroupId,
      } = removeWorkspaceGroupState(
        { ...state.paneGroups, [newGroup.id]: newGroup },
        {
          ...state.tabHistoryByGroupId,
          [newGroup.id]: buildRecentTabOrder([], newGroup.tabs, newGroup.activeTabId),
        },
        clearRecentTabTraversal(state.recentTabTraversalByGroupId, newGroup.id),
        sourceGroupIds,
      );
      const nextSidebarState = removeWorkspaceFromSidebarState(
        state.sidebarTree,
        state.pinnedSidebarNodes,
        sourceWorkspaceId,
      );

      // Update target workspace root and focus
      const newActiveId =
        state.activeWorkspaceId === sourceWorkspaceId ? targetWs.id : state.activeWorkspaceId;

      set({
        workspaces: removeWorkspaceRecord(state.workspaces, sourceWorkspaceId).map((w) =>
          w.id === targetWs.id ? { ...w, root: newRoot, focusedGroupId: newGroup.id } : w,
        ),
        activeWorkspaceId: newActiveId,
        paneGroups: nextPaneGroups,
        sidebarTree: nextSidebarState.sidebarTree,
        pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
        tabHistoryByGroupId,
        recentTabTraversalByGroupId,
      });
    },

    createWorkspaceFromTab(tabId, sourceGroupId, sourceWorkspaceId, opts) {
      const state = get();
      const sourceWs = state.workspaces.find((w) => w.id === sourceWorkspaceId);
      if (!sourceWs) return;
      if (!treeHasGroup(sourceWs.root, sourceGroupId)) return;

      const sourceGroup = state.paneGroups[sourceGroupId];
      if (!sourceGroup) return;

      const tab = sourceGroup.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const pane = state.panes[tab.paneId];
      if (!pane) return;

      // Create a new PaneGroup with a single tab referencing the same paneId
      const newTabId = nanoid();
      const newGroup: PaneGroup = {
        id: nanoid(),
        tabs: [{ id: newTabId, paneId: tab.paneId }],
        activeTabId: newTabId,
      };

      // Create new workspace using pane title as workspace name
      const newWs = createDefaultWorkspace(pane.title, newGroup);

      const resolution = resolveSourceGroupAfterTabRemoval(
        sourceWs,
        sourceGroupId,
        sourceGroup,
        tabId,
      );

      // Insert new workspace node into sidebar tree
      const targetContainer = opts?.container ?? "main";
      const parentFolderId = opts?.parentFolderId ?? null;
      const targetNodes = getSidebarNodesForContainer(
        { sidebarTree: state.sidebarTree, pinnedSidebarNodes: state.pinnedSidebarNodes },
        targetContainer,
      );
      const insertIndex = opts?.insertIndex ?? targetNodes.length;
      const newSidebarNode = {
        type: "workspace" as const,
        workspaceId: newWs.id,
      };
      const insertedNodes = insertSidebarNode(
        targetNodes,
        newSidebarNode,
        parentFolderId,
        insertIndex,
      );

      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId,
        sourceGroupId,
        removedTabId: tabId,
        resolution,
        nextWorkspaces: [...state.workspaces, newWs],
        nextPaneGroups: { ...state.paneGroups, [newGroup.id]: newGroup },
        nextTabHistoryByGroupId: {
          ...state.tabHistoryByGroupId,
          [newGroup.id]: [newTabId],
        },
        nextRecentTabTraversalByGroupId: clearRecentTabTraversal(
          state.recentTabTraversalByGroupId,
          newGroup.id,
        ),
      });

      set({
        workspaces: nextState.workspaces,
        activeWorkspaceId: newWs.id,
        panes: nextState.panes,
        paneGroups: nextState.paneGroups,
        sidebarTree: targetContainer === "main" ? insertedNodes : state.sidebarTree,
        pinnedSidebarNodes: targetContainer === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
        tabHistoryByGroupId: nextState.tabHistoryByGroupId,
        recentTabTraversalByGroupId: nextState.recentTabTraversalByGroupId,
      });
    },
  };
}

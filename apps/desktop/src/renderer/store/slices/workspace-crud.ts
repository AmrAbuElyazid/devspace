import { nanoid } from "nanoid";
import type { PaneGroup, PaneGroupTab, SplitDirection, SplitNode } from "../../types/workspace";
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
import {
  getSidebarNodesForContainer,
  cleanupPaneResources,
  defaultPaneCleanupDeps,
} from "../store-helpers";
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

export function createWorkspaceCrudSlice(set: StoreSet, get: StoreGet): WorkspaceCrudSlice {
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

      for (const gid of groupIds) {
        const group = newPaneGroups[gid];
        if (group) {
          for (const tab of group.tabs) {
            cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps);
            delete newPanes[tab.paneId];
          }
          delete newPaneGroups[gid];
        }
      }

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
        });
        return;
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

      // Collect all tabs from all groups in source workspace
      const sourceGroupIds = collectGroupIds(sourceWs.root);
      const allSourceTabs: PaneGroupTab[] = [];
      for (const gid of sourceGroupIds) {
        const group = state.paneGroups[gid];
        if (group) {
          for (const tab of group.tabs) {
            allSourceTabs.push({ id: nanoid(), paneId: tab.paneId });
          }
        }
      }

      // Append new tabs to target group, set last as active
      const lastNewTab = allSourceTabs[allSourceTabs.length - 1];
      const newPaneGroups = {
        ...state.paneGroups,
        [targetGroupId]: {
          ...targetGroup,
          tabs: [...targetGroup.tabs, ...allSourceTabs],
          activeTabId: lastNewTab?.id ?? targetGroup.activeTabId,
        },
      };

      // Clean up source workspace groups (don't cleanup pane resources — panes are moved)
      for (const gid of sourceGroupIds) {
        delete newPaneGroups[gid];
      }

      // Remove source workspace from workspaces array
      const remaining = state.workspaces.filter((w) => w.id !== sourceWorkspaceId);

      // Remove from sidebar trees
      const [newTree] = removeSidebarNode(state.sidebarTree, sourceWorkspaceId, "workspace");
      const [newPinnedTree] = removeSidebarNode(
        state.pinnedSidebarNodes,
        sourceWorkspaceId,
        "workspace",
      );

      // If source was active, switch to target workspace
      const newActiveId =
        state.activeWorkspaceId === sourceWorkspaceId ? targetWs.id : state.activeWorkspaceId;

      set({
        workspaces: remaining,
        activeWorkspaceId: newActiveId,
        paneGroups: newPaneGroups,
        sidebarTree: newTree,
        pinnedSidebarNodes: newPinnedTree,
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

      // Collect all tabs from all groups in source workspace (flatten with fresh tab IDs)
      const sourceGroupIds = collectGroupIds(sourceWs.root);
      const allSourceTabs: PaneGroupTab[] = [];
      for (const gid of sourceGroupIds) {
        const group = state.paneGroups[gid];
        if (group) {
          for (const tab of group.tabs) {
            allSourceTabs.push({ id: nanoid(), paneId: tab.paneId });
          }
        }
      }

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

      // Clean up source workspace groups (don't cleanup pane resources)
      const newPaneGroups = { ...state.paneGroups, [newGroup.id]: newGroup };
      for (const gid of sourceGroupIds) {
        delete newPaneGroups[gid];
      }

      // Remove source workspace
      const remaining = state.workspaces.filter((w) => w.id !== sourceWorkspaceId);

      // Remove from sidebar trees
      const [newTree] = removeSidebarNode(state.sidebarTree, sourceWorkspaceId, "workspace");
      const [newPinnedTree] = removeSidebarNode(
        state.pinnedSidebarNodes,
        sourceWorkspaceId,
        "workspace",
      );

      // Update target workspace root and focus
      const newActiveId =
        state.activeWorkspaceId === sourceWorkspaceId ? targetWs.id : state.activeWorkspaceId;

      set({
        workspaces: remaining.map((w) =>
          w.id === targetWs.id ? { ...w, root: newRoot, focusedGroupId: newGroup.id } : w,
        ),
        activeWorkspaceId: newActiveId,
        paneGroups: newPaneGroups,
        sidebarTree: newTree,
        pinnedSidebarNodes: newPinnedTree,
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

      // Handle source group cleanup
      const newPaneGroups = { ...state.paneGroups, [newGroup.id]: newGroup };
      let newWorkspaces = [...state.workspaces, newWs];
      let newPanes = state.panes;

      const resolution = resolveSourceGroupAfterTabRemoval(
        sourceWs,
        sourceGroupId,
        sourceGroup,
        tabId,
      );
      switch (resolution.kind) {
        case "tabs-remaining":
          newPaneGroups[sourceGroupId] = resolution.srcGroup;
          break;
        case "group-removed":
          delete newPaneGroups[sourceGroupId];
          newWorkspaces = newWorkspaces.map((w) =>
            w.id === sourceWorkspaceId
              ? { ...w, root: resolution.newRoot, focusedGroupId: resolution.newFocusedGroupId }
              : w,
          );
          break;
        case "group-replaced-with-fallback":
          newPanes = { ...state.panes, [resolution.fallbackPane.id]: resolution.fallbackPane };
          newPaneGroups[sourceGroupId] = resolution.srcGroup;
          break;
      }

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

      set({
        workspaces: newWorkspaces,
        activeWorkspaceId: newWs.id,
        panes: newPanes,
        paneGroups: newPaneGroups,
        sidebarTree: targetContainer === "main" ? insertedNodes : state.sidebarTree,
        pinnedSidebarNodes: targetContainer === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
      });
    },
  };
}

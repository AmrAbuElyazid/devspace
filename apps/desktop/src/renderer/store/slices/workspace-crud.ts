import { buildSplitReplacement, treeHasGroup, replaceLeafInTree } from "../../lib/split-tree";
import {
  createDefaultWorkspaceBundle,
  createPaneGroupFromTabs,
  createPaneWithInheritedConfig,
  nextWorkspaceName,
} from "../../lib/pane-factory";
import { resolveSourceGroupAfterTabRemoval } from "../../lib/source-group-resolution";
import type { PaneCleanup } from "../store-helpers";
import { applySourceGroupTabRemovalResolution } from "../source-group-state";
import {
  buildWorkspaceRemovalState,
  buildTransferredWorkspaceDestinationState,
  resolveWorkspaceTransferContext,
} from "../workspace-transfer-state";
import {
  createWorkspaceEntryFromPane,
  createWorkspaceEntryFromPaneId,
  insertWorkspaceIntoSidebarState,
  resolveWorkspaceTabCreationContext,
} from "../workspace-creation-state";
import { attachPaneOwnersByPaneId } from "../pane-ownership";
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
      const currentState = get();
      const activeWs = currentState.workspaces.find((w) => w.id === currentState.activeWorkspaceId);
      const pane = createPaneWithInheritedConfig(
        paneType,
        currentState.panes,
        currentState.paneGroups,
        activeWs?.focusedGroupId ?? undefined,
        activeWs,
      );
      const wsName = name ?? nextWorkspaceName(get().workspaces);
      const { group, workspace } = createWorkspaceEntryFromPane(wsName, pane);
      if (activeWs?.lastTerminalCwd) {
        workspace.lastTerminalCwd = activeWs.lastTerminalCwd;
      }
      set((state) => {
        const nextSidebarState = insertWorkspaceIntoSidebarState(state, workspace.id, {
          container,
          parentFolderId,
          insertIndex: 0,
        });

        return attachPaneOwnersByPaneId(state, {
          workspaces: [...state.workspaces, workspace],
          activeWorkspaceId: workspace.id,
          panes: { ...state.panes, [pane.id]: pane },
          paneGroups: { ...state.paneGroups, [group.id]: group },
          sidebarTree: nextSidebarState.sidebarTree,
          pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
          pendingEditId: workspace.id,
          pendingEditType: "workspace" as const,
        });
      });
      return workspace.id;
    },

    removeWorkspace: (id) => {
      const state = get();
      const nextRemovalState = buildWorkspaceRemovalState(state, id);
      if (!nextRemovalState) return;

      cleanupPanes(state.panes, nextRemovalState.removedPaneIds);

      if (nextRemovalState.workspaces.length === 0) {
        const freshWorkspace = createDefaultWorkspaceBundle("Workspace 1");
        set((currentState) =>
          attachPaneOwnersByPaneId(currentState, {
            workspaces: [freshWorkspace.workspace],
            activeWorkspaceId: freshWorkspace.workspace.id,
            panes: {
              ...nextRemovalState.panes,
              [freshWorkspace.pane.id]: freshWorkspace.pane,
            },
            paneGroups: {
              ...nextRemovalState.paneGroups,
              [freshWorkspace.group.id]: freshWorkspace.group,
            },
            pinnedSidebarNodes: [],
            sidebarTree: [
              ...nextRemovalState.sidebarTree,
              { type: "workspace" as const, workspaceId: freshWorkspace.workspace.id },
            ],
            tabHistoryByGroupId: {},
            recentTabTraversalByGroupId: {},
          }),
        );
        return;
      }

      set((currentState) =>
        attachPaneOwnersByPaneId(currentState, {
          workspaces: nextRemovalState.workspaces,
          activeWorkspaceId: nextRemovalState.activeWorkspaceId ?? state.activeWorkspaceId,
          panes: nextRemovalState.panes,
          paneGroups: nextRemovalState.paneGroups,
          pinnedSidebarNodes: nextRemovalState.pinnedSidebarNodes,
          sidebarTree: nextRemovalState.sidebarTree,
          tabHistoryByGroupId: nextRemovalState.tabHistoryByGroupId,
          recentTabTraversalByGroupId: nextRemovalState.recentTabTraversalByGroupId,
        }),
      );
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
      const transfer = resolveWorkspaceTransferContext(state, sourceWorkspaceId, targetGroupId);
      if (!transfer) return;

      // Append new tabs to target group, set last as active
      const { sourceGroupIds, tabs: allSourceTabs, targetGroup, targetWorkspace } = transfer;
      const lastNewTab = allSourceTabs[allSourceTabs.length - 1];
      const nextTransferState = buildTransferredWorkspaceDestinationState({
        state,
        group: targetGroup,
        tabs: [...targetGroup.tabs, ...allSourceTabs],
        activeTabId: lastNewTab?.id ?? targetGroup.activeTabId,
        sourceWorkspaceId,
        sourceGroupIds,
        fallbackActiveWorkspaceId: targetWorkspace.id,
      });

      set((currentState) =>
        attachPaneOwnersByPaneId(currentState, {
          workspaces: nextTransferState.workspaces,
          activeWorkspaceId: nextTransferState.activeWorkspaceId,
          paneGroups: nextTransferState.paneGroups,
          sidebarTree: nextTransferState.sidebarTree,
          pinnedSidebarNodes: nextTransferState.pinnedSidebarNodes,
          tabHistoryByGroupId: nextTransferState.tabHistoryByGroupId,
          recentTabTraversalByGroupId: nextTransferState.recentTabTraversalByGroupId,
        }),
      );
    },

    splitGroupWithWorkspace(sourceWorkspaceId, targetGroupId, side) {
      const state = get();
      const transfer = resolveWorkspaceTransferContext(state, sourceWorkspaceId, targetGroupId);
      if (!transfer) return;

      const { sourceGroupIds, tabs: allSourceTabs, targetWorkspace } = transfer;

      // Create a new PaneGroup with all collected tabs
      const newGroup = createPaneGroupFromTabs(allSourceTabs);
      const replacement = buildSplitReplacement(targetGroupId, newGroup.id, side);

      const newRoot = replaceLeafInTree(targetWorkspace.root, targetGroupId, replacement);
      const nextTransferState = buildTransferredWorkspaceDestinationState({
        state,
        group: newGroup,
        tabs: newGroup.tabs,
        activeTabId: newGroup.activeTabId,
        sourceWorkspaceId,
        sourceGroupIds,
        fallbackActiveWorkspaceId: targetWorkspace.id,
      });

      set((currentState) =>
        attachPaneOwnersByPaneId(currentState, {
          workspaces: nextTransferState.workspaces.map((w) =>
            w.id === targetWorkspace.id ? { ...w, root: newRoot, focusedGroupId: newGroup.id } : w,
          ),
          activeWorkspaceId: nextTransferState.activeWorkspaceId,
          paneGroups: nextTransferState.paneGroups,
          sidebarTree: nextTransferState.sidebarTree,
          pinnedSidebarNodes: nextTransferState.pinnedSidebarNodes,
          tabHistoryByGroupId: nextTransferState.tabHistoryByGroupId,
          recentTabTraversalByGroupId: nextTransferState.recentTabTraversalByGroupId,
        }),
      );
    },

    createWorkspaceFromTab(tabId, sourceGroupId, sourceWorkspaceId, opts) {
      const state = get();
      const context = resolveWorkspaceTabCreationContext(
        state,
        sourceWorkspaceId,
        sourceGroupId,
        tabId,
      );
      if (!context) return;

      const { sourceWorkspace, sourceGroup, tab, pane } = context;
      const { group: newGroup, workspace: newWorkspace } = createWorkspaceEntryFromPaneId(
        pane.title,
        tab.paneId,
      );

      const resolution = resolveSourceGroupAfterTabRemoval(
        sourceWorkspace,
        sourceGroupId,
        sourceGroup,
        tabId,
      );

      const nextSidebarState = insertWorkspaceIntoSidebarState(state, newWorkspace.id, opts);

      const nextState = applySourceGroupTabRemovalResolution({
        state,
        sourceWorkspaceId,
        sourceGroupId,
        removedTabId: tabId,
        resolution,
        nextWorkspaces: [...state.workspaces, newWorkspace],
        nextPaneGroups: {
          ...state.paneGroups,
          [newGroup.id]: newGroup,
        },
        nextTabHistoryByGroupId: {
          ...state.tabHistoryByGroupId,
          [newGroup.id]: [newGroup.activeTabId],
        },
      });

      set({
        workspaces: nextState.workspaces,
        activeWorkspaceId: newWorkspace.id,
        panes: nextState.panes,
        paneGroups: nextState.paneGroups,
        paneOwnersByPaneId: nextState.paneOwnersByPaneId,
        sidebarTree: nextSidebarState.sidebarTree,
        pinnedSidebarNodes: nextSidebarState.pinnedSidebarNodes,
        tabHistoryByGroupId: nextState.tabHistoryByGroupId,
        recentTabTraversalByGroupId: nextState.recentTabTraversalByGroupId,
      });
    },
  };
}

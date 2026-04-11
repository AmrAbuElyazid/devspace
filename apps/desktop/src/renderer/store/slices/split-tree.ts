import { nanoid } from "nanoid";
import type { SplitNode } from "../../types/workspace";
import {
  collectGroupIds,
  treeHasGroup,
  findFirstGroupId,
  findSiblingGroupId,
  removeGroupFromTree,
  replaceLeafInTree,
  simplifyTree,
  updateSizesAtPath,
} from "../../lib/split-tree";
import { createPane, createPaneGroup, findNearestTerminalCwd } from "../../lib/pane-factory";
import { attachPaneOwnersByPaneId } from "../pane-ownership";
import { clearRecentTabTraversal } from "../tab-history";
import type { PaneCleanup } from "../store-helpers";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type SplitTreeSlice = Pick<WorkspaceState, "splitGroup" | "closeGroup" | "updateSplitSizes">;

export function createSplitTreeSlice(
  set: StoreSet,
  get: StoreGet,
  cleanupPanes: PaneCleanup,
): SplitTreeSlice {
  return {
    splitGroup(workspaceId, groupId, direction, defaultType) {
      // Read state outside set() only for side-effect-free preparation
      const snapshot = get();
      const ws = snapshot.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!treeHasGroup(ws.root, groupId)) return;

      const paneType = defaultType ?? "terminal";
      let inheritedConfig: Partial<import("../../types/workspace").PaneConfig> | undefined;
      if (paneType === "terminal") {
        const cwd = findNearestTerminalCwd(snapshot.panes, snapshot.paneGroups, groupId, ws);
        if (cwd) inheritedConfig = { cwd };
      } else if (paneType === "note") {
        inheritedConfig = { noteId: nanoid() };
      }
      const newPane = createPane(paneType, inheritedConfig);
      const newGroup = createPaneGroup(newPane);

      const replacement: SplitNode = {
        type: "branch",
        direction,
        children: [
          { type: "leaf", groupId },
          { type: "leaf", groupId: newGroup.id },
        ],
        sizes: [50, 50],
      };

      set((state) =>
        attachPaneOwnersByPaneId(state, {
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  root: replaceLeafInTree(w.root, groupId, replacement),
                  focusedGroupId: newGroup.id,
                }
              : w,
          ),
          panes: { ...state.panes, [newPane.id]: newPane },
          paneGroups: { ...state.paneGroups, [newGroup.id]: newGroup },
        }),
      );
      get().recordTabActivation(newGroup.id, newGroup.activeTabId);
    },

    closeGroup(workspaceId, groupId) {
      // Side effects (IPC cleanup) must happen before set()
      const snapshot = get();
      const ws = snapshot.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!treeHasGroup(ws.root, groupId)) return;
      const group = snapshot.paneGroups[groupId];
      if (!group) return;

      cleanupPanes(
        snapshot.panes,
        group.tabs.map((tab) => tab.paneId),
      );

      set((state) => {
        // Re-validate inside updater with fresh state
        const currentWs = state.workspaces.find((w) => w.id === workspaceId);
        if (!currentWs || !treeHasGroup(currentWs.root, groupId)) return state;
        const currentGroup = state.paneGroups[groupId];
        if (!currentGroup) return state;

        const newPanes = { ...state.panes };
        for (const tab of currentGroup.tabs) {
          delete newPanes[tab.paneId];
        }

        const allGroupIds = collectGroupIds(currentWs.root);
        const newPaneGroups = { ...state.paneGroups };

        if (allGroupIds.length <= 1) {
          // Last group — create fresh terminal group
          const fallbackPane = createPane("terminal");
          newPanes[fallbackPane.id] = fallbackPane;
          const freshGroup = createPaneGroup(fallbackPane);
          delete newPaneGroups[groupId];
          newPaneGroups[freshGroup.id] = freshGroup;

          return attachPaneOwnersByPaneId(state, {
            workspaces: state.workspaces.map((w) =>
              w.id === workspaceId
                ? {
                    ...w,
                    root: { type: "leaf" as const, groupId: freshGroup.id },
                    focusedGroupId: freshGroup.id,
                    zoomedGroupId: null,
                  }
                : w,
            ),
            panes: newPanes,
            paneGroups: newPaneGroups,
            tabHistoryByGroupId: {
              ...state.tabHistoryByGroupId,
              [groupId]: [],
            },
            recentTabTraversalByGroupId: clearRecentTabTraversal(
              state.recentTabTraversalByGroupId,
              groupId,
            ),
          });
        }

        // Multiple groups — remove from tree and transfer focus
        const newFocusedGroupId =
          currentWs.focusedGroupId === groupId
            ? (findSiblingGroupId(currentWs.root, groupId) ?? findFirstGroupId(currentWs.root))
            : currentWs.focusedGroupId;
        const newZoomedGroupId =
          currentWs.zoomedGroupId === groupId ? null : currentWs.zoomedGroupId;

        const newRoot = removeGroupFromTree(currentWs.root, groupId);
        const simplifiedRoot = newRoot ? simplifyTree(newRoot) : currentWs.root;

        delete newPaneGroups[groupId];

        return attachPaneOwnersByPaneId(state, {
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  root: simplifiedRoot,
                  focusedGroupId: newFocusedGroupId,
                  zoomedGroupId: newZoomedGroupId,
                }
              : w,
          ),
          panes: newPanes,
          paneGroups: newPaneGroups,
          tabHistoryByGroupId: {
            ...state.tabHistoryByGroupId,
            [groupId]: [],
          },
          recentTabTraversalByGroupId: clearRecentTabTraversal(
            state.recentTabTraversalByGroupId,
            groupId,
          ),
        });
      });
    },

    updateSplitSizes(workspaceId, nodePath, sizes) {
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, root: updateSizesAtPath(w.root, nodePath, sizes) } : w,
        ),
      }));
    },
  };
}

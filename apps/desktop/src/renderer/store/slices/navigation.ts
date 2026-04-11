import { findGroupInDirection, type FocusDirection } from "../../lib/split-navigation";
import { collectGroupIds, treeHasGroup } from "../../lib/split-tree";
import { attachWorkspaceDerivedState } from "../pane-ownership";
import {
  buildRecentTabOrder,
  clearAllRecentTabTraversals,
  clearRecentTabTraversal,
  type RecentTabTraversalState,
} from "../tab-history";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type NavigationSlice = Pick<
  WorkspaceState,
  | "activateNextWorkspace"
  | "activatePrevWorkspace"
  | "activateNextTab"
  | "activatePrevTab"
  | "activateRecentTab"
  | "focusGroupInDirection"
  | "recordTabActivation"
  | "clearRecentTabTraversals"
  | "togglePaneZoom"
>;

const RECENT_TAB_TRAVERSAL_WINDOW_MS = 1000;

function activateAdjacentWorkspace(set: StoreSet, delta: 1 | -1): void {
  set((state) => {
    const idx = state.workspaces.findIndex((w) => w.id === state.activeWorkspaceId);
    if (idx < 0 || state.workspaces.length <= 1) return state;
    const targetIdx = (idx + delta + state.workspaces.length) % state.workspaces.length;
    const targetWs = state.workspaces[targetIdx];
    if (!targetWs) return state;
    return attachWorkspaceDerivedState(state, {
      activeWorkspaceId: targetWs.id,
      workspaces: state.workspaces.map((w) =>
        w.id === targetWs.id ? { ...w, lastActiveAt: Date.now() } : w,
      ),
    });
  });
}

function activateAdjacentTab(set: StoreSet, groupId: string, delta: 1 | -1): void {
  set((state) => {
    const group = state.paneGroups[groupId];
    if (!group || group.tabs.length <= 1) return state;
    const idx = group.tabs.findIndex((t) => t.id === group.activeTabId);
    if (idx < 0) return state;

    const targetIdx = (idx + delta + group.tabs.length) % group.tabs.length;
    const targetTab = group.tabs[targetIdx];
    if (!targetTab) return state;

    return {
      paneGroups: {
        ...state.paneGroups,
        [groupId]: { ...group, activeTabId: targetTab.id },
      },
      tabHistoryByGroupId: {
        ...state.tabHistoryByGroupId,
        [groupId]: buildRecentTabOrder(
          state.tabHistoryByGroupId[groupId],
          group.tabs,
          targetTab.id,
        ),
      },
      recentTabTraversalByGroupId: clearRecentTabTraversal(
        state.recentTabTraversalByGroupId,
        groupId,
      ),
    };
  });
}

function normalizeTraversalOrder(
  traversal: RecentTabTraversalState,
  groupTabIds: string[],
): string[] {
  const filtered = traversal.order.filter((tabId) => groupTabIds.includes(tabId));
  const missing = groupTabIds.filter((tabId) => !filtered.includes(tabId));
  return [...filtered, ...missing];
}

export function createNavigationSlice(set: StoreSet, _get: StoreGet): NavigationSlice {
  return {
    activateNextWorkspace() {
      activateAdjacentWorkspace(set, 1);
    },

    activatePrevWorkspace() {
      activateAdjacentWorkspace(set, -1);
    },

    activateNextTab(_workspaceId, groupId) {
      activateAdjacentTab(set, groupId, 1);
    },

    activatePrevTab(_workspaceId, groupId) {
      activateAdjacentTab(set, groupId, -1);
    },

    activateRecentTab(workspaceId, groupId, direction) {
      set((state) => {
        const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
        if (!workspace || !treeHasGroup(workspace.root, groupId)) return state;

        const group = state.paneGroups[groupId];
        if (!group || group.tabs.length <= 1) return state;

        const now = Date.now();
        const groupTabIds = group.tabs.map((tab) => tab.id);
        const traversal = state.recentTabTraversalByGroupId[groupId];
        const canContinueTraversal =
          traversal !== undefined &&
          now - traversal.updatedAt <= RECENT_TAB_TRAVERSAL_WINDOW_MS &&
          traversal.order[traversal.index] === group.activeTabId;

        const order = canContinueTraversal
          ? normalizeTraversalOrder(traversal, groupTabIds)
          : buildRecentTabOrder(state.tabHistoryByGroupId[groupId], group.tabs, group.activeTabId);
        if (order.length <= 1) return state;

        const currentIndex = canContinueTraversal ? traversal.index : 0;
        const nextIndex = (currentIndex + direction + order.length) % order.length;
        const targetTabId = order[nextIndex];
        if (!targetTabId || targetTabId === group.activeTabId) return state;

        return {
          paneGroups: {
            ...state.paneGroups,
            [groupId]: { ...group, activeTabId: targetTabId },
          },
          tabHistoryByGroupId: canContinueTraversal
            ? state.tabHistoryByGroupId
            : {
                ...state.tabHistoryByGroupId,
                [groupId]: order,
              },
          recentTabTraversalByGroupId: {
            ...state.recentTabTraversalByGroupId,
            [groupId]: {
              order,
              index: nextIndex,
              updatedAt: now,
            },
          },
        };
      });
    },

    focusGroupInDirection(workspaceId, direction) {
      set((state) => {
        const ws = state.workspaces.find((w) => w.id === workspaceId);
        if (!ws) return state;
        if (ws.zoomedGroupId) return state;

        const currentGroupId = ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
        if (!currentGroupId) return state;

        const targetGroupId = findGroupInDirection(
          ws.root,
          currentGroupId,
          direction as FocusDirection,
        );
        if (!targetGroupId) return state;

        return {
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, focusedGroupId: targetGroupId } : w,
          ),
        };
      });
    },

    togglePaneZoom(workspaceId) {
      set((state) => {
        const ws = state.workspaces.find((w) => w.id === workspaceId);
        if (!ws) return state;

        const newZoomedGroupId = ws.zoomedGroupId
          ? null
          : (ws.focusedGroupId ?? collectGroupIds(ws.root)[0] ?? null);
        return {
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, zoomedGroupId: newZoomedGroupId } : w,
          ),
        };
      });
    },

    recordTabActivation(groupId, tabId) {
      set((state) => {
        const group = state.paneGroups[groupId];
        if (!group || !group.tabs.some((tab) => tab.id === tabId)) return state;

        return {
          tabHistoryByGroupId: {
            ...state.tabHistoryByGroupId,
            [groupId]: buildRecentTabOrder(state.tabHistoryByGroupId[groupId], group.tabs, tabId),
          },
          recentTabTraversalByGroupId: clearRecentTabTraversal(
            state.recentTabTraversalByGroupId,
            groupId,
          ),
        };
      });
    },

    clearRecentTabTraversals() {
      set((state) => ({
        recentTabTraversalByGroupId: clearAllRecentTabTraversals(state.recentTabTraversalByGroupId),
      }));
    },
  };
}

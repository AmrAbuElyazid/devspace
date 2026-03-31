import { findGroupInDirection, type FocusDirection } from "../../lib/split-navigation";
import { collectGroupIds } from "../../lib/split-tree";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type NavigationSlice = Pick<
  WorkspaceState,
  | "activateNextWorkspace"
  | "activatePrevWorkspace"
  | "activateNextTab"
  | "activatePrevTab"
  | "focusGroupInDirection"
  | "togglePaneZoom"
>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function activateAdjacentWorkspace(set: StoreSet, delta: 1 | -1): void {
  set((state) => {
    const idx = state.workspaces.findIndex((w) => w.id === state.activeWorkspaceId);
    if (idx < 0 || state.workspaces.length <= 1) return state;
    const targetIdx = (idx + delta + state.workspaces.length) % state.workspaces.length;
    const targetWs = state.workspaces[targetIdx];
    if (!targetWs) return state;
    return {
      activeWorkspaceId: targetWs.id,
      workspaces: state.workspaces.map((w) =>
        w.id === targetWs.id ? { ...w, lastActiveAt: Date.now() } : w,
      ),
    };
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
    };
  });
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

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

    focusGroupInDirection(workspaceId, direction) {
      set((state) => {
        const ws = state.workspaces.find((w) => w.id === workspaceId);
        if (!ws) return state;
        // Directional navigation is a no-op while a pane is zoomed
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
        // Toggle: if currently zoomed, unzoom. Otherwise zoom the focused group.
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
  };
}

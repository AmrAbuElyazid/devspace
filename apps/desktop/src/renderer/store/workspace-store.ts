import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Workspace,
  SidebarNode,
  Pane,
  PaneType,
  PaneConfig,
  SplitNode,
  SplitDirection,
  PaneGroup,
  PaneGroupTab,
} from "../types/workspace";
import { findGroupInDirection, type FocusDirection } from "../lib/split-navigation";
import {
  findSidebarNode,
  findFolder,
  removeSidebarNode,
  insertSidebarNode,
  isDescendant,
  updateFolderInTree,
  removeFolderPromoteChildren,
} from "../lib/sidebar-tree";
import { cleanupPaneResources, type PaneCleanupDeps } from "../lib/pane-cleanup";
import type { DropSide } from "../types/dnd";
import { markBrowserPaneDestroyed } from "../lib/browser-pane-session";
import { useBrowserStore } from "./browser-store";

import { validateWorkspaceGraph } from "../lib/workspace-graph";
import { normalizeSidebarPersistence } from "../lib/sidebar-organization";
import {
  collectGroupIds,
  treeHasGroup,
  getTopLeftGroupId,
  findFirstGroupId,
  findSiblingGroupId,
  findParentOfGroup,
  simplifyTree,
  repairTree,
  removeGroupFromTree,
  replaceLeafInTree,
  updateSizesAtPath,
} from "../lib/split-tree";
import {
  titleForType,
  createPane,
  createPaneGroup,
  nextWorkspaceName,
  createDefaultWorkspace,
  findNearestTerminalCwd,
} from "../lib/pane-factory";
import { resolveSourceGroupAfterTabRemoval } from "../lib/source-group-resolution";

// Re-export tree helpers for consumers that import from this module
export {
  collectGroupIds,
  getTopLeftGroupId,
  findFirstGroupId,
  findSiblingGroupId,
  findParentOfGroup,
  repairTree,
  removeGroupFromTree,
} from "../lib/split-tree";

function findOwnerFolder(nodes: SidebarNode[], target: SidebarNode[]): string | null {
  for (const n of nodes) {
    if (n.type === "folder") {
      if (n.children === target) return n.id;
      const found = findOwnerFolder(n.children, target);
      if (found) return found;
    }
  }
  return null;
}

type SidebarContainer = "main" | "pinned";

function getSidebarNodesForContainer(
  state: Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">,
  container: SidebarContainer,
): SidebarNode[] {
  return container === "main" ? state.sidebarTree : state.pinnedSidebarNodes;
}

function locateSidebarNodeContainer(
  state: Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">,
  nodeId: string,
  nodeType: "workspace" | "folder",
): SidebarContainer | null {
  if (findSidebarNode(state.sidebarTree, nodeId, nodeType)) return "main";
  if (findSidebarNode(state.pinnedSidebarNodes, nodeId, nodeType)) return "pinned";
  return null;
}

const defaultPaneCleanupDeps: PaneCleanupDeps = {
  destroyTerminal: (surfaceId) => {
    void window.api.terminal.destroy(surfaceId);
  },
  destroyBrowser: (paneId) => {
    void window.api.browser.destroy(paneId);
    markBrowserPaneDestroyed(paneId);
  },
  destroyEditor: (paneId) => {
    void window.api.editor.stop(paneId);
  },
  destroyT3Code: (paneId) => {
    void window.api.t3code.stop(paneId);
  },
  clearBrowserRuntime: (paneId) => {
    useBrowserStore.getState().clearRuntimeState(paneId);
  },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
  pinnedSidebarNodes: SidebarNode[];
  sidebarTree: SidebarNode[];
  /** Set by addWorkspace/addFolder when the newly created item should enter edit mode */
  pendingEditId: string | null;
  pendingEditType: "workspace" | "folder" | "tab" | null;
  clearPendingEdit: () => void;

  // Workspace CRUD
  addWorkspace: (
    name?: string,
    parentFolderId?: string | null,
    container?: SidebarContainer,
    defaultType?: PaneType,
  ) => string;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspace: (id: string) => void;
  togglePinWorkspace: (id: string) => void;
  pinWorkspace: (id: string) => void;
  unpinWorkspace: (id: string) => void;
  pinFolder: (folderId: string) => void;
  unpinFolder: (folderId: string) => void;

  // Sidebar tree actions
  reorderSidebarNode: (
    nodeId: string,
    nodeType: "workspace" | "folder",
    targetParentId: string | null,
    targetIndex: number,
  ) => void;
  moveSidebarNode: (args: {
    nodeId: string;
    nodeType: "workspace" | "folder";
    sourceContainer: SidebarContainer;
    targetContainer: SidebarContainer;
    targetParentId: string | null;
    targetIndex: number;
  }) => void;
  addFolder: (name: string, parentId?: string | null, container?: SidebarContainer) => string;
  removeFolder: (folderId: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  toggleFolderCollapsed: (folderId: string) => void;
  expandFolder: (folderId: string) => void;

  // Focus
  setFocusedGroup: (workspaceId: string, groupId: string) => void;

  // Group tab CRUD
  addGroupTab: (workspaceId: string, groupId: string, defaultType?: PaneType) => void;
  removeGroupTab: (workspaceId: string, groupId: string, tabId: string) => void;
  setActiveGroupTab: (workspaceId: string, groupId: string, tabId: string) => void;
  reorderGroupTabs: (
    workspaceId: string,
    groupId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  moveTabToGroup: (
    workspaceId: string,
    srcGroupId: string,
    tabId: string,
    destGroupId: string,
    insertIndex?: number,
  ) => void;
  splitGroupWithTab: (
    workspaceId: string,
    srcGroupId: string,
    tabId: string,
    targetGroupId: string,
    side: DropSide,
  ) => void;
  moveTabToWorkspace: (
    srcWorkspaceId: string,
    srcGroupId: string,
    tabId: string,
    destWorkspaceId: string,
  ) => void;
  mergeWorkspaceIntoGroup: (sourceWorkspaceId: string, targetGroupId: string) => void;
  splitGroupWithWorkspace: (
    sourceWorkspaceId: string,
    targetGroupId: string,
    side: DropSide,
  ) => void;
  createWorkspaceFromTab: (
    tabId: string,
    sourceGroupId: string,
    sourceWorkspaceId: string,
    opts?: {
      parentFolderId?: string | null;
      container?: SidebarContainer;
      insertIndex?: number;
    },
  ) => void;

  // Browser in group
  openBrowserInGroup: (workspaceId: string, groupId: string, url: string) => void;

  // Editor in active workspace (used by CLI open-editor)
  openEditorTab: (folderPath: string) => void;

  // Split operations
  splitGroup: (
    workspaceId: string,
    groupId: string,
    direction: SplitDirection,
    defaultType?: PaneType,
  ) => void;
  closeGroup: (workspaceId: string, groupId: string) => void;
  updateSplitSizes: (workspaceId: string, nodePath: number[], sizes: number[]) => void;

  // Navigation
  activateNextWorkspace: () => void;
  activatePrevWorkspace: () => void;
  activateNextTab: (workspaceId: string, groupId: string) => void;
  activatePrevTab: (workspaceId: string, groupId: string) => void;
  focusGroupInDirection: (workspaceId: string, direction: "left" | "right" | "up" | "down") => void;
  togglePaneZoom: (workspaceId: string) => void;

  // Pane operations
  addPane: (type: PaneType, config?: Partial<PaneConfig>) => string;
  removePane: (paneId: string) => void;
  updatePaneConfig: (paneId: string, updates: Partial<PaneConfig>) => void;
  updateBrowserPaneZoom: (paneId: string, zoom: number) => void;
  updatePaneTitle: (paneId: string, title: string) => void;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const PERSIST_KEY = "devspace-workspaces";
const PERSIST_DEBOUNCE_MS = 500;

// Migration: detect old persisted format and convert to new model
function migratePersistedState(
  persisted: Record<string, unknown>,
): Pick<
  WorkspaceState,
  "workspaces" | "activeWorkspaceId" | "panes" | "paneGroups" | "pinnedSidebarNodes" | "sidebarTree"
> | null {
  const oldWorkspaces = persisted.workspaces as Array<Record<string, unknown>> | undefined;
  if (!oldWorkspaces || oldWorkspaces.length === 0) return null;

  // Detect old format: workspace has `tabs` array and no `root`
  const firstWs = oldWorkspaces[0]!;
  if (!firstWs.tabs || firstWs.root) return null; // Not old format

  const newPanes: Record<string, Pane> = { ...(persisted.panes as Record<string, Pane>) };
  const newPaneGroups: Record<string, PaneGroup> = {};
  const newWorkspaces: Workspace[] = [];

  for (const oldWs of oldWorkspaces) {
    const oldTabs = oldWs.tabs as Array<{
      id: string;
      name: string;
      root: SplitNode;
      focusedPaneId: string | null;
    }>;

    if (!oldTabs || oldTabs.length === 0) continue;

    // Find the active tab
    const activeTabId = oldWs.activeTabId as string;
    const activeTab = oldTabs.find((t) => t.id === activeTabId) ?? oldTabs[0]!;

    // Convert the active tab's tree: each leaf { type: 'leaf', paneId } -> { type: 'leaf', groupId }
    // Each leaf pane gets its own PaneGroup
    const firstGroupId: string[] = [];

    function convertTree(node: unknown): SplitNode {
      const n = node as Record<string, unknown>;
      if (n.type === "leaf") {
        const paneId = n.paneId as string;
        // Ensure the pane exists; create empty fallback if missing
        if (!newPanes[paneId]) {
          newPanes[paneId] = {
            id: paneId,
            type: "terminal",
            title: "Terminal",
            config: {},
          };
        }
        const group = createPaneGroup(newPanes[paneId]!);
        newPaneGroups[group.id] = group;
        firstGroupId.push(group.id);
        return { type: "leaf", groupId: group.id };
      }

      // Branch node
      return {
        type: "branch",
        direction: n.direction as SplitDirection,
        children: (n.children as unknown[]).map(convertTree),
        sizes: n.sizes as number[],
      };
    }

    const newRoot = convertTree(activeTab.root);

    // Consolidate inactive tab panes into the first group as additional tabs
    const targetGroupId = firstGroupId[0];
    if (targetGroupId) {
      for (const oldTab of oldTabs) {
        if (oldTab.id === activeTab.id) continue;
        // Collect all pane IDs from this inactive tab's tree
        const inactivePaneIds = collectOldPaneIds(oldTab.root);
        for (const paneId of inactivePaneIds) {
          if (!newPanes[paneId]) {
            newPanes[paneId] = {
              id: paneId,
              type: "terminal",
              title: "Terminal",
              config: {},
            };
          }
          const newTabEntry: PaneGroupTab = { id: nanoid(), paneId };
          newPaneGroups[targetGroupId]!.tabs.push(newTabEntry);
        }
      }
    }

    const ws: Workspace = {
      id: oldWs.id as string,
      name: oldWs.name as string,
      root: newRoot,
      focusedGroupId: firstGroupId[0] ?? null,
      zoomedGroupId: null,
      lastActiveAt: Date.now(),
    };
    newWorkspaces.push(ws);
  }

  if (newWorkspaces.length === 0) return null;

  return {
    workspaces: newWorkspaces,
    activeWorkspaceId: persisted.activeWorkspaceId as string,
    panes: newPanes,
    paneGroups: newPaneGroups,
    pinnedSidebarNodes: [],
    sidebarTree: persisted.sidebarTree as SidebarNode[],
  };
}

// Helper to collect paneIds from old-format SplitNode trees (with paneId leaves)
function collectOldPaneIds(node: unknown): string[] {
  const n = node as Record<string, unknown>;
  if (n.type === "leaf") return [n.paneId as string];
  return ((n.children as unknown[]) ?? []).flatMap(collectOldPaneIds);
}

function loadPersistedState(): Pick<
  WorkspaceState,
  "workspaces" | "activeWorkspaceId" | "panes" | "paneGroups" | "pinnedSidebarNodes" | "sidebarTree"
> | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const persisted = JSON.parse(raw);
    // If persisted data has old format (no sidebarTree), ignore it (fresh start)
    if (!persisted.sidebarTree) return null;

    // Check if this is the new format (has paneGroups)
    if (persisted.paneGroups) {
      const workspaces = (persisted.workspaces as Array<Workspace & { pinned?: boolean }>).map(
        (ws) => ({
          ...ws,
          lastActiveAt: ws.lastActiveAt ?? Date.now(),
        }),
      );

      // Repair any orphaned tree leaves
      const validGroupIds = new Set(Object.keys(persisted.paneGroups));
      const repairedWorkspaces = workspaces.map((ws) => {
        const repaired = repairTree(ws.root, validGroupIds);
        if (!repaired) {
          // Entire tree was orphaned — create a fresh group
          const freshPane = createPane("terminal");
          const freshGroup = createPaneGroup(freshPane);
          persisted.panes[freshPane.id] = freshPane;
          persisted.paneGroups[freshGroup.id] = freshGroup;
          return {
            ...ws,
            root: { type: "leaf" as const, groupId: freshGroup.id },
            focusedGroupId: freshGroup.id,
          };
        }
        if (repaired !== ws.root) {
          // Tree was repaired — update focusedGroupId if it points to a removed group
          const remainingGroups = collectGroupIds(repaired);
          const focusedGroupId =
            ws.focusedGroupId && remainingGroups.includes(ws.focusedGroupId)
              ? ws.focusedGroupId
              : findFirstGroupId(repaired);
          return { ...ws, root: repaired, focusedGroupId };
        }
        return ws;
      });

      const normalizedSidebar = normalizeSidebarPersistence({
        workspaces: repairedWorkspaces,
        pinnedSidebarNodes: (persisted.pinnedSidebarNodes as SidebarNode[] | undefined) ?? [],
        sidebarTree: persisted.sidebarTree as SidebarNode[],
      });

      // Migrate any lingering 'empty' panes to 'terminal'
      const migratedPanes: Record<string, Pane> = persisted.panes ?? {};
      for (const [id, pane] of Object.entries(migratedPanes)) {
        if ((pane as Record<string, unknown>).type === "empty") {
          migratedPanes[id] = { ...pane, type: "terminal", title: "Terminal", config: {} };
        }
      }

      return {
        workspaces: repairedWorkspaces,
        activeWorkspaceId: persisted.activeWorkspaceId,
        panes: migratedPanes,
        paneGroups: persisted.paneGroups,
        pinnedSidebarNodes: normalizedSidebar.pinnedSidebarNodes,
        sidebarTree: normalizedSidebar.sidebarTree,
      };
    }

    // Try to migrate from old format
    const migrated = migratePersistedState(persisted);
    if (migrated) return migrated;

    // Can't migrate, return null for fresh start
    return null;
  } catch (err) {
    console.warn("[workspace-store] Loading persisted state from localStorage failed:", err);
    return null;
  }
}

// Build initial state — hydrate from localStorage or create defaults
function buildInitialState(): Pick<
  WorkspaceState,
  "workspaces" | "activeWorkspaceId" | "panes" | "paneGroups" | "pinnedSidebarNodes" | "sidebarTree"
> {
  const persisted = loadPersistedState();
  if (persisted) {
    const validation = validateWorkspaceGraph({
      activeWorkspaceId: persisted.activeWorkspaceId,
      workspaces: persisted.workspaces,
      paneGroups: persisted.paneGroups,
      panes: persisted.panes,
    });
    if (!validation.valid) {
      console.warn(`[WorkspaceStore] Discarding invalid persisted state: ${validation.reason}`);
    } else {
      return persisted;
    }
  }
  const pane = createPane("terminal");
  const group = createPaneGroup(pane);
  const ws = createDefaultWorkspace("Workspace 1", group);
  return {
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    panes: { [pane.id]: pane },
    paneGroups: { [group.id]: group },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace" as const, workspaceId: ws.id }],
  };
}

// ---------------------------------------------------------------------------
// Shared navigation helpers (deduplicates next/prev mirror-image functions)
// ---------------------------------------------------------------------------

type StoreGet = () => WorkspaceState;
type StoreSet = (partial: Partial<WorkspaceState>) => void;

function activateAdjacentWorkspace(get: StoreGet, set: StoreSet, delta: 1 | -1): void {
  const state = get();
  const idx = state.workspaces.findIndex((w) => w.id === state.activeWorkspaceId);
  if (idx < 0 || state.workspaces.length <= 1) return;
  const targetIdx = (idx + delta + state.workspaces.length) % state.workspaces.length;
  const targetWs = state.workspaces[targetIdx];
  if (targetWs) {
    set({
      activeWorkspaceId: targetWs.id,
      workspaces: state.workspaces.map((w) =>
        w.id === targetWs.id ? { ...w, lastActiveAt: Date.now() } : w,
      ),
    });
  }
}

function activateAdjacentTab(get: StoreGet, set: StoreSet, groupId: string, delta: 1 | -1): void {
  const state = get();
  const group = state.paneGroups[groupId];
  if (!group || group.tabs.length <= 1) return;
  const idx = group.tabs.findIndex((t) => t.id === group.activeTabId);
  if (idx < 0) return;
  const targetIdx = (idx + delta + group.tabs.length) % group.tabs.length;
  const targetTab = group.tabs[targetIdx];
  if (targetTab) {
    set({
      paneGroups: {
        ...state.paneGroups,
        [groupId]: { ...group, activeTabId: targetTab.id },
      },
    });
  }
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...buildInitialState(),
  pendingEditId: null,
  pendingEditType: null,
  clearPendingEdit: () => set({ pendingEditId: null, pendingEditType: null }),

  // -------------------------------------------------------------------
  // Workspace CRUD
  // -------------------------------------------------------------------

  addWorkspace: (name, parentFolderId = null, container = "main", defaultType) => {
    const paneType = defaultType ?? "terminal";
    // Inherit CWD from the currently focused terminal in the active workspace
    const currentState = get();
    const activeWs = currentState.workspaces.find((w) => w.id === currentState.activeWorkspaceId);
    let inheritedConfig: Partial<PaneConfig> | undefined;
    if (paneType === "terminal") {
      const cwd = findNearestTerminalCwd(
        currentState.panes,
        currentState.paneGroups,
        activeWs?.focusedGroupId ?? undefined,
        activeWs,
      );
      if (cwd) inheritedConfig = { cwd };
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
        parentFolderId === null ? targetNodes.length : Infinity,
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
    set({
      workspaces: get().workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    });
  },

  setActiveWorkspace(id) {
    set({
      activeWorkspaceId: id,
      workspaces: get().workspaces.map((w) =>
        w.id === id ? { ...w, lastActiveAt: Date.now() } : w,
      ),
    });
  },

  togglePinWorkspace(id) {
    const state = get();
    const container = locateSidebarNodeContainer(state, id, "workspace");
    if (container === "pinned") {
      state.unpinWorkspace(id);
    } else if (container === "main") {
      state.pinWorkspace(id);
    }
  },

  pinWorkspace(id) {
    const state = get();
    if (locateSidebarNodeContainer(state, id, "workspace") !== "main") return;
    state.moveSidebarNode({
      nodeId: id,
      nodeType: "workspace",
      sourceContainer: "main",
      targetContainer: "pinned",
      targetParentId: null,
      targetIndex: state.pinnedSidebarNodes.length,
    });
  },

  unpinWorkspace(id) {
    const state = get();
    if (locateSidebarNodeContainer(state, id, "workspace") !== "pinned") return;
    state.moveSidebarNode({
      nodeId: id,
      nodeType: "workspace",
      sourceContainer: "pinned",
      targetContainer: "main",
      targetParentId: null,
      targetIndex: state.sidebarTree.length,
    });
  },

  pinFolder(folderId) {
    const state = get();
    if (locateSidebarNodeContainer(state, folderId, "folder") !== "main") return;
    state.moveSidebarNode({
      nodeId: folderId,
      nodeType: "folder",
      sourceContainer: "main",
      targetContainer: "pinned",
      targetParentId: null,
      targetIndex: state.pinnedSidebarNodes.length,
    });
  },

  unpinFolder(folderId) {
    const state = get();
    if (locateSidebarNodeContainer(state, folderId, "folder") !== "pinned") return;
    state.moveSidebarNode({
      nodeId: folderId,
      nodeType: "folder",
      sourceContainer: "pinned",
      targetContainer: "main",
      targetParentId: null,
      targetIndex: state.sidebarTree.length,
    });
  },

  // -------------------------------------------------------------------
  // Focus
  // -------------------------------------------------------------------

  setFocusedGroup(workspaceId, groupId) {
    const workspace = get().workspaces.find((w) => w.id === workspaceId);
    if (!workspace || !treeHasGroup(workspace.root, groupId)) return;

    set({
      workspaces: get().workspaces.map((w) =>
        w.id === workspaceId ? { ...w, focusedGroupId: groupId } : w,
      ),
    });
  },

  // -------------------------------------------------------------------
  // Group tab CRUD
  // -------------------------------------------------------------------

  addGroupTab(workspaceId, groupId, defaultType) {
    const state = get();
    const { paneGroups, panes, workspaces } = state;
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace || !treeHasGroup(workspace.root, groupId)) return;
    const group = paneGroups[groupId];
    if (!group) return;

    const paneType = defaultType ?? "terminal";
    // Inherit CWD from the nearest terminal (same group → focused group → workspace.lastTerminalCwd → $HOME)
    let inheritedConfig: Partial<PaneConfig> | undefined;
    if (paneType === "terminal") {
      const cwd = findNearestTerminalCwd(panes, paneGroups, groupId, workspace);
      if (cwd) inheritedConfig = { cwd };
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

    // Cleanup the pane for this tab
    cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps);
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
              ? { ...w, root: resolution.newRoot, focusedGroupId: resolution.newFocusedGroupId }
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
    const { paneGroups, workspaces } = get();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace || !treeHasGroup(workspace.root, groupId)) return;
    const group = paneGroups[groupId];
    if (!group) return;
    if (!group.tabs.some((tab) => tab.id === tabId)) return;

    set({
      paneGroups: {
        ...paneGroups,
        [groupId]: { ...group, activeTabId: tabId },
      },
    });
  },

  reorderGroupTabs(workspaceId, groupId, fromIndex, toIndex) {
    const { paneGroups, workspaces } = get();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace || !treeHasGroup(workspace.root, groupId)) return;
    const group = paneGroups[groupId];
    if (!group) return;

    const tabs = [...group.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    if (!moved) return;
    tabs.splice(toIndex, 0, moved);

    set({
      paneGroups: {
        ...paneGroups,
        [groupId]: { ...group, tabs },
      },
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
    // We use the *original* workspace tree for resolution — the tree modification
    // (replaceLeafInTree) only affects the target, not the source group count.
    // Special case: when srcGroupId === targetGroupId, the original tree has
    // only 1 group (the same leaf), so it correctly falls into "group-replaced-with-fallback"
    // rather than "group-removed".
    const resolution = resolveSourceGroupAfterTabRemoval(ws, srcGroupId, srcGroup, tabId);
    switch (resolution.kind) {
      case "tabs-remaining":
        newPaneGroups[srcGroupId] = resolution.srcGroup;
        break;
      case "group-removed":
        // Source group was the last tab and tree had multiple groups in the
        // *original* tree — remove it from the *already-modified* newRoot.
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
    const container = opts?.container ?? "main";
    const parentFolderId = opts?.parentFolderId ?? null;
    const targetNodes = getSidebarNodesForContainer(
      { sidebarTree: state.sidebarTree, pinnedSidebarNodes: state.pinnedSidebarNodes },
      container,
    );
    const insertIndex = opts?.insertIndex ?? targetNodes.length;
    const newSidebarNode: SidebarNode = { type: "workspace" as const, workspaceId: newWs.id };
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
      sidebarTree: container === "main" ? insertedNodes : state.sidebarTree,
      pinnedSidebarNodes: container === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
    });
  },

  // -------------------------------------------------------------------
  // Browser in group
  // -------------------------------------------------------------------

  openBrowserInGroup(workspaceId, groupId, url) {
    const state = get();
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace || !treeHasGroup(workspace.root, groupId)) return;
    const group = state.paneGroups[groupId];
    if (!group) return;

    const paneId = get().addPane("browser", { url });
    const newTab: PaneGroupTab = { id: nanoid(), paneId };
    const currentGroup = get().paneGroups[groupId];
    if (!currentGroup) return;

    set({
      paneGroups: {
        ...get().paneGroups,
        [groupId]: {
          ...currentGroup,
          tabs: [...currentGroup.tabs, newTab],
          activeTabId: newTab.id,
        },
      },
    });
  },

  // -------------------------------------------------------------------
  // Editor in active workspace (CLI)
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // Split operations
  // -------------------------------------------------------------------

  splitGroup(workspaceId, groupId, direction, defaultType) {
    const state = get();
    const { workspaces, panes, paneGroups } = state;
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    if (!treeHasGroup(ws.root, groupId)) return;

    const paneType = defaultType ?? "terminal";
    // Inherit CWD from the pane being split
    let inheritedConfig: Partial<PaneConfig> | undefined;
    if (paneType === "terminal") {
      const cwd = findNearestTerminalCwd(panes, paneGroups, groupId, ws);
      if (cwd) inheritedConfig = { cwd };
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

    set({
      workspaces: workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              root: replaceLeafInTree(w.root, groupId, replacement),
              focusedGroupId: newGroup.id,
            }
          : w,
      ),
      panes: { ...panes, [newPane.id]: newPane },
      paneGroups: { ...paneGroups, [newGroup.id]: newGroup },
    });
  },

  closeGroup(workspaceId, groupId) {
    const state = get();
    const ws = state.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    if (!treeHasGroup(ws.root, groupId)) return;

    const group = state.paneGroups[groupId];
    if (!group) return;

    // Cleanup all panes in the group
    const newPanes = { ...state.panes };
    for (const tab of group.tabs) {
      cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps);
      delete newPanes[tab.paneId];
    }

    const allGroupIds = collectGroupIds(ws.root);
    const newPaneGroups = { ...state.paneGroups };

    if (allGroupIds.length <= 1) {
      // Last group — create fresh terminal group
      const fallbackPane = createPane("terminal");
      newPanes[fallbackPane.id] = fallbackPane;
      const freshGroup = createPaneGroup(fallbackPane);
      delete newPaneGroups[groupId];
      newPaneGroups[freshGroup.id] = freshGroup;

      set({
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId
            ? {
                ...w,
                root: { type: "leaf", groupId: freshGroup.id },
                focusedGroupId: freshGroup.id,
                zoomedGroupId: null,
              }
            : w,
        ),
        panes: newPanes,
        paneGroups: newPaneGroups,
      });
      return;
    }

    // Multiple groups — remove from tree and transfer focus
    const newFocusedGroupId =
      ws.focusedGroupId === groupId
        ? (findSiblingGroupId(ws.root, groupId) ?? findFirstGroupId(ws.root))
        : ws.focusedGroupId;
    // Clear zoom if the zoomed group was closed
    const newZoomedGroupId = ws.zoomedGroupId === groupId ? null : ws.zoomedGroupId;

    const newRoot = removeGroupFromTree(ws.root, groupId);
    const simplifiedRoot = newRoot ? simplifyTree(newRoot) : ws.root;

    delete newPaneGroups[groupId];

    set({
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
    });
  },

  updateSplitSizes(workspaceId, nodePath, sizes) {
    set({
      workspaces: get().workspaces.map((w) =>
        w.id === workspaceId ? { ...w, root: updateSizesAtPath(w.root, nodePath, sizes) } : w,
      ),
    });
  },

  // -------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------

  activateNextWorkspace() {
    activateAdjacentWorkspace(get, set, 1);
  },

  activatePrevWorkspace() {
    activateAdjacentWorkspace(get, set, -1);
  },

  activateNextTab(workspaceId, groupId) {
    activateAdjacentTab(get, set, groupId, 1);
  },

  activatePrevTab(workspaceId, groupId) {
    activateAdjacentTab(get, set, groupId, -1);
  },

  focusGroupInDirection(workspaceId, direction) {
    const state = get();
    const ws = state.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    // Directional navigation is a no-op while a pane is zoomed
    if (ws.zoomedGroupId) return;
    const currentGroupId = ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
    if (!currentGroupId) return;
    const targetGroupId = findGroupInDirection(
      ws.root,
      currentGroupId,
      direction as FocusDirection,
    );
    if (targetGroupId) {
      set({
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, focusedGroupId: targetGroupId } : w,
        ),
      });
    }
  },

  togglePaneZoom(workspaceId) {
    const state = get();
    const ws = state.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    // Toggle: if currently zoomed, unzoom. Otherwise zoom the focused group.
    const newZoomedGroupId = ws.zoomedGroupId
      ? null
      : (ws.focusedGroupId ?? collectGroupIds(ws.root)[0] ?? null);
    set({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, zoomedGroupId: newZoomedGroupId } : w,
      ),
    });
  },

  // -------------------------------------------------------------------
  // Pane operations
  // -------------------------------------------------------------------

  addPane(type, config) {
    const pane = {
      id: nanoid(),
      type,
      title: titleForType[type],
      config: config ?? {},
    } as Pane;

    set({ panes: { ...get().panes, [pane.id]: pane } });
    return pane.id;
  },

  removePane(paneId) {
    const { panes } = get();
    cleanupPaneResources(panes, paneId, defaultPaneCleanupDeps);
    const newPanes = { ...panes };
    delete newPanes[paneId];
    set({ panes: newPanes });
  },

  updatePaneConfig(paneId, updates) {
    const state = get();
    const pane = state.panes[paneId];
    if (!pane) return;

    const nextConfig = { ...pane.config, ...updates };
    const keys = Object.keys(updates) as Array<keyof typeof nextConfig>;
    const hasChange = keys.some((key) => pane.config[key] !== nextConfig[key]);
    if (!hasChange) return;

    const patch: Partial<WorkspaceState> = {
      panes: {
        ...state.panes,
        [paneId]: { ...pane, config: nextConfig } as Pane,
      },
    };

    // Track last terminal CWD on the owning workspace for inheritance fallback
    if (pane.type === "terminal" && "cwd" in updates && typeof updates.cwd === "string") {
      const ownerWs = state.workspaces.find((ws) => {
        const groupIds = collectGroupIds(ws.root);
        return groupIds.some((gid) => {
          const group = state.paneGroups[gid];
          return group?.tabs.some((tab) => tab.paneId === paneId);
        });
      });
      if (ownerWs) {
        patch.workspaces = state.workspaces.map((ws) =>
          ws.id === ownerWs.id ? { ...ws, lastTerminalCwd: updates.cwd as string } : ws,
        );
      }
    }

    set(patch);
  },

  updateBrowserPaneZoom(paneId, zoom) {
    const { panes } = get();
    const pane = panes[paneId];
    if (!pane || pane.type !== "browser") return;

    if (pane.config.zoom === zoom) return;

    set({
      panes: {
        ...panes,
        [paneId]: {
          ...pane,
          config: { ...pane.config, zoom },
        },
      },
    });
  },

  updatePaneTitle(paneId, title) {
    const { panes } = get();
    const pane = panes[paneId];
    if (!pane) return;

    set({
      panes: { ...panes, [paneId]: { ...pane, title } },
    });
  },

  // -------------------------------------------------------------------
  // Sidebar tree actions
  // -------------------------------------------------------------------

  moveSidebarNode: ({
    nodeId,
    nodeType,
    sourceContainer,
    targetContainer,
    targetParentId,
    targetIndex,
  }) => {
    set((state) => {
      const sourceNodes = getSidebarNodesForContainer(state, sourceContainer);
      const targetNodes = getSidebarNodesForContainer(state, targetContainer);
      const sameContainer = sourceContainer === targetContainer;

      const sourceParentId = (() => {
        const result = findSidebarNode(sourceNodes, nodeId, nodeType);
        if (!result) return null;
        // result.parent is the array containing the node. If it's the root array,
        // there's no parent folder. Otherwise find the folder whose children === result.parent.
        if (result.parent === sourceNodes) return null;
        return findOwnerFolder(sourceNodes, result.parent);
      })();

      const sourceSiblingNodes =
        sourceParentId === null
          ? sourceNodes
          : (findFolder(sourceNodes, sourceParentId)?.children ?? []);

      const sourceIndex = sourceSiblingNodes.findIndex((child) => {
        if (nodeType === "workspace") {
          return child.type === "workspace" && child.workspaceId === nodeId;
        }
        return child.type === "folder" && child.id === nodeId;
      });

      if (nodeType === "folder" && targetParentId !== null) {
        if (nodeId === targetParentId) return state;
        if (sameContainer && isDescendant(sourceNodes, nodeId, targetParentId)) return state;
      }

      const [sourceAfterRemove, removed] = removeSidebarNode(sourceNodes, nodeId, nodeType);
      if (!removed) return state;

      const insertionBase = sourceContainer === targetContainer ? sourceAfterRemove : targetNodes;
      const adjustedTargetIndex =
        sameContainer &&
        sourceParentId === targetParentId &&
        sourceIndex !== -1 &&
        sourceIndex < targetIndex
          ? targetIndex - 1
          : targetIndex;
      const targetAfterInsert = insertSidebarNode(
        insertionBase,
        removed,
        targetParentId,
        adjustedTargetIndex,
      );

      return {
        sidebarTree:
          targetContainer === "main"
            ? targetAfterInsert
            : sourceContainer === "main"
              ? sourceAfterRemove
              : state.sidebarTree,
        pinnedSidebarNodes:
          targetContainer === "pinned"
            ? targetAfterInsert
            : sourceContainer === "pinned"
              ? sourceAfterRemove
              : state.pinnedSidebarNodes,
      };
    });
  },

  reorderSidebarNode: (nodeId, nodeType, targetParentId, targetIndex) => {
    get().moveSidebarNode({
      nodeId,
      nodeType,
      sourceContainer: "main",
      targetContainer: "main",
      targetParentId,
      targetIndex,
    });
  },

  addFolder: (name, parentId = null, container = "main") => {
    const id = nanoid();
    const folderNode: SidebarNode = { type: "folder", id, name, collapsed: false, children: [] };
    set((state) => {
      const targetNodes = getSidebarNodesForContainer(state, container);
      const insertedNodes = insertSidebarNode(
        targetNodes,
        folderNode,
        parentId,
        parentId === null ? targetNodes.length : Infinity,
      );

      return {
        sidebarTree: container === "main" ? insertedNodes : state.sidebarTree,
        pinnedSidebarNodes: container === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
        pendingEditId: id,
        pendingEditType: "folder" as const,
      };
    });
    return id;
  },

  removeFolder: (folderId) => {
    set((state) => ({
      sidebarTree: removeFolderPromoteChildren(state.sidebarTree, folderId),
      pinnedSidebarNodes: removeFolderPromoteChildren(state.pinnedSidebarNodes, folderId),
    }));
  },

  renameFolder: (folderId, name) => {
    set((state) => ({
      sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { name }),
      pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, { name }),
    }));
  },

  toggleFolderCollapsed: (folderId) => {
    set((state) => {
      const folder =
        findFolder(state.sidebarTree, folderId) ?? findFolder(state.pinnedSidebarNodes, folderId);
      if (!folder) return state;
      return {
        sidebarTree: updateFolderInTree(state.sidebarTree, folderId, {
          collapsed: !folder.collapsed,
        }),
        pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, {
          collapsed: !folder.collapsed,
        }),
      };
    });
  },

  expandFolder: (folderId) => {
    set((state) => ({
      sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { collapsed: false }),
      pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, {
        collapsed: false,
      }),
    }));
  },
}));

// ---------------------------------------------------------------------------
// Debounced persistence
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistState(state: WorkspaceState): void {
  const data = {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    pinnedSidebarNodes: state.pinnedSidebarNodes,
    sidebarTree: state.sidebarTree,
    panes: state.panes,
    paneGroups: state.paneGroups,
  };
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("[Persist] Failed to save state:", e);
  }
}

function debouncedPersist(state: WorkspaceState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistState(state), PERSIST_DEBOUNCE_MS);
}

// Subscribe to store changes
useWorkspaceStore.subscribe((state) => debouncedPersist(state));

// Flush on unload (prevents data loss on window close)
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistState(useWorkspaceStore.getState());
    }
  });
}

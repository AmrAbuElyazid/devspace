import { nanoid } from "nanoid";
import type {
  Workspace,
  Pane,
  SplitNode,
  SplitDirection,
  PaneGroup,
  PaneGroupTab,
  SidebarNode,
} from "../types/workspace";
import { validateWorkspaceGraph } from "../lib/workspace-graph";
import { normalizeSidebarPersistence } from "../lib/sidebar-organization";
import { collectGroupIds, repairTree, findFirstGroupId } from "../lib/split-tree";
import { createPane, createPaneGroup, createDefaultWorkspace } from "../lib/pane-factory";
import type { WorkspaceState } from "./workspace-state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSIST_KEY = "devspace-workspaces";
const PERSIST_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Types for persisted state subset
// ---------------------------------------------------------------------------

type PersistedState = Pick<
  WorkspaceState,
  "workspaces" | "activeWorkspaceId" | "panes" | "paneGroups" | "pinnedSidebarNodes" | "sidebarTree"
>;

// ---------------------------------------------------------------------------
// Migration: detect old persisted format and convert to new model
// ---------------------------------------------------------------------------

function migratePersistedState(persisted: Record<string, unknown>): PersistedState | null {
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

// ---------------------------------------------------------------------------
// Load persisted state
// ---------------------------------------------------------------------------

function loadPersistedState(): PersistedState | null {
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

// ---------------------------------------------------------------------------
// Build initial state — hydrate from localStorage or create defaults
// ---------------------------------------------------------------------------

export function buildInitialState(): PersistedState {
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
// Debounced persistence
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function selectPersistedState(state: WorkspaceState): PersistedState {
  return {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    pinnedSidebarNodes: state.pinnedSidebarNodes,
    sidebarTree: state.sidebarTree,
    panes: state.panes,
    paneGroups: state.paneGroups,
  };
}

function hasPersistedStateChanged(previous: PersistedState, next: PersistedState): boolean {
  return (
    previous.workspaces !== next.workspaces ||
    previous.activeWorkspaceId !== next.activeWorkspaceId ||
    previous.pinnedSidebarNodes !== next.pinnedSidebarNodes ||
    previous.sidebarTree !== next.sidebarTree ||
    previous.panes !== next.panes ||
    previous.paneGroups !== next.paneGroups
  );
}

function persistState(data: PersistedState): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("[Persist] Failed to save state:", e);
  }
}

function debouncedPersist(data: PersistedState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistState(data), PERSIST_DEBOUNCE_MS);
}

export function setupPersistence(store: {
  subscribe: (fn: (state: WorkspaceState) => void) => void;
  getState: () => WorkspaceState;
}): void {
  let lastPersistedState = selectPersistedState(store.getState());

  store.subscribe((state) => {
    const nextPersistedState = selectPersistedState(state);
    if (!hasPersistedStateChanged(lastPersistedState, nextPersistedState)) {
      return;
    }

    lastPersistedState = nextPersistedState;
    debouncedPersist(nextPersistedState);
  });

  // Flush on unload (prevents data loss on window close)
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistState(lastPersistedState);
      }
    });
  }
}

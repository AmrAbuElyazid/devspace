import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";
import type { WorkspaceState } from "./workspace-state";

const PERSIST_DEBOUNCE_MS = 500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function selectPersistedState(state: WorkspaceState): PersistedWorkspaceState {
  return {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    pinnedSidebarNodes: state.pinnedSidebarNodes,
    sidebarTree: state.sidebarTree,
    panes: state.panes,
    paneGroups: state.paneGroups,
  };
}

function hasPersistedStateChanged(
  previous: PersistedWorkspaceState,
  next: PersistedWorkspaceState,
): boolean {
  return (
    previous.workspaces !== next.workspaces ||
    previous.activeWorkspaceId !== next.activeWorkspaceId ||
    previous.pinnedSidebarNodes !== next.pinnedSidebarNodes ||
    previous.sidebarTree !== next.sidebarTree ||
    previous.panes !== next.panes ||
    previous.paneGroups !== next.paneGroups
  );
}

async function persistState(data: PersistedWorkspaceState): Promise<void> {
  try {
    await window.api.workspaceState.save(data);
  } catch (error) {
    console.error("[Persist] Failed to save state:", error);
  }
}

function debouncedPersist(data: PersistedWorkspaceState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistState(data);
  }, PERSIST_DEBOUNCE_MS);
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

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        void persistState(lastPersistedState);
      }
    });
  }
}

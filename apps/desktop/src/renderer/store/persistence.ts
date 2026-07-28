import type {
  PersistedPane,
  PersistedPaneGroup,
  PersistedWorkspace,
  PersistedWorkspacePatch,
  PersistedWorkspaceState,
} from "../../shared/workspace-persistence";
import type { WorkspaceState } from "./workspace-state";

const PERSIST_DEBOUNCE_MS = 500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let beforeUnloadListener: (() => void) | null = null;

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

function haveSameIds(
  previous: readonly { id: string }[],
  next: readonly { id: string }[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((entity, index) => entity.id === next[index]?.id)
  );
}

function buildWorkspaceListPatch(
  previous: PersistedWorkspace[],
  next: PersistedWorkspace[],
): PersistedWorkspacePatch["workspaces"] {
  if (previous === next) return undefined;

  const previousById = new Map(previous.map((workspace) => [workspace.id, workspace]));
  const nextIds = new Set(next.map((workspace) => workspace.id));
  const upsert = next.filter((workspace) => previousById.get(workspace.id) !== workspace);
  const removeIds = previous
    .filter((workspace) => !nextIds.has(workspace.id))
    .map((workspace) => workspace.id);
  const orderChanged = !haveSameIds(previous, next);

  if (upsert.length === 0 && removeIds.length === 0 && !orderChanged) return undefined;

  return {
    upsert,
    removeIds,
    ...(orderChanged ? { orderedIds: next.map((workspace) => workspace.id) } : {}),
  };
}

function buildRecordPatch<T extends PersistedPane | PersistedPaneGroup>(
  previous: Record<string, T>,
  next: Record<string, T>,
): { upsert: T[]; removeIds: string[] } | undefined {
  if (previous === next) return undefined;

  const upsert = Object.entries(next)
    .filter(([id, entity]) => previous[id] !== entity)
    .map(([, entity]) => entity);
  const removeIds = Object.keys(previous).filter(
    (id) => !Object.prototype.hasOwnProperty.call(next, id),
  );

  return upsert.length > 0 || removeIds.length > 0 ? { upsert, removeIds } : undefined;
}

export function buildPersistedWorkspacePatch(
  previous: PersistedWorkspaceState,
  next: PersistedWorkspaceState,
): PersistedWorkspacePatch {
  const workspaces = buildWorkspaceListPatch(previous.workspaces, next.workspaces);
  const panes = buildRecordPatch(previous.panes, next.panes);
  const paneGroups = buildRecordPatch(previous.paneGroups, next.paneGroups);

  return {
    ...(workspaces ? { workspaces } : {}),
    ...(previous.activeWorkspaceId !== next.activeWorkspaceId
      ? { activeWorkspaceId: next.activeWorkspaceId }
      : {}),
    ...(panes ? { panes } : {}),
    ...(paneGroups ? { paneGroups } : {}),
    ...(previous.pinnedSidebarNodes !== next.pinnedSidebarNodes
      ? { pinnedSidebarNodes: next.pinnedSidebarNodes }
      : {}),
    ...(previous.sidebarTree !== next.sidebarTree ? { sidebarTree: next.sidebarTree } : {}),
  };
}

function isEmptyPatch(patch: PersistedWorkspacePatch): boolean {
  return Object.keys(patch).length === 0;
}

export function setupPersistence(store: {
  subscribe: (fn: (state: WorkspaceState) => void) => void;
  getState: () => WorkspaceState;
}): void {
  let latestState = selectPersistedState(store.getState());
  let lastSavedState = latestState;

  const queuePersist = (target: PersistedWorkspaceState): void => {
    persistChain = persistChain.then(async () => {
      const patch = buildPersistedWorkspacePatch(lastSavedState, target);
      if (isEmptyPatch(patch)) {
        lastSavedState = target;
        return;
      }

      try {
        const result = await window.api.workspaceState.patch(patch);
        if ("needsFullSave" in result) {
          await window.api.workspaceState.save(target);
        }
        lastSavedState = target;
      } catch (patchError) {
        // A rejected patch means main could not reconcile it against its
        // baseline. Retrying more patches against that same baseline would
        // fail the same way for the rest of the session, so fall back to a
        // full save, which replaces the baseline outright.
        try {
          await window.api.workspaceState.save(target);
          lastSavedState = target;
        } catch (saveError) {
          console.error("[Persist] Failed to save state:", saveError, "after patch:", patchError);
        }
      }
    });
  };

  const schedulePersist = (): void => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      queuePersist(latestState);
    }, PERSIST_DEBOUNCE_MS);
  };

  store.subscribe((state) => {
    const nextState = selectPersistedState(state);
    if (!hasPersistedStateChanged(latestState, nextState)) return;

    latestState = nextState;
    schedulePersist();
  });

  if (typeof window !== "undefined") {
    if (beforeUnloadListener) {
      window.removeEventListener("beforeunload", beforeUnloadListener);
    }

    beforeUnloadListener = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (hasPersistedStateChanged(lastSavedState, latestState)) {
        window.api.workspaceState.saveSync(latestState);
      }
    };

    window.addEventListener("beforeunload", beforeUnloadListener);
  }
}

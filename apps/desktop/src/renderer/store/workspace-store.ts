import { create } from "zustand";
import type { WorkspaceState } from "./workspace-state";
import { setupPersistence } from "./persistence";
import { createUIStateSlice } from "./slices/ui-state";
import { createSidebarTreeSlice } from "./slices/sidebar-tree";
import { createPaneManagementSlice } from "./slices/pane-management";
import { createGroupTabsSlice } from "./slices/group-tabs";
import { createWorkspaceCrudSlice } from "./slices/workspace-crud";
import { createSplitTreeSlice } from "./slices/split-tree";
import { createNavigationSlice } from "./slices/navigation";
import { defaultPaneCleanup } from "./store-helpers";
import {
  createDefaultPersistedWorkspaceState,
  normalizePersistedWorkspaceState,
} from "./persistence-model";
import { buildPaneOwnersByPaneId } from "./pane-ownership";

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

const defaultPersistedState = createDefaultPersistedWorkspaceState();
let persistenceInitialized = false;

function applyWorkspaceSnapshot(
  snapshot: ReturnType<typeof normalizePersistedWorkspaceState>,
): void {
  useWorkspaceStore.setState({
    ...(snapshot ?? defaultPersistedState),
    paneOwnersByPaneId: buildPaneOwnersByPaneId(
      (snapshot ?? defaultPersistedState).workspaces,
      (snapshot ?? defaultPersistedState).paneGroups,
    ),
    tabHistoryByGroupId: {},
    recentTabTraversalByGroupId: {},
    pendingEditId: null,
    pendingEditType: null,
  });

  if (!persistenceInitialized) {
    setupPersistence(useWorkspaceStore);
    persistenceInitialized = true;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...defaultPersistedState,
  paneOwnersByPaneId: buildPaneOwnersByPaneId(
    defaultPersistedState.workspaces,
    defaultPersistedState.paneGroups,
  ),
  ...createUIStateSlice(set),
  ...createSidebarTreeSlice(set, get),
  ...createPaneManagementSlice(set, get, defaultPaneCleanup),
  ...createGroupTabsSlice(set, get, defaultPaneCleanup),
  ...createWorkspaceCrudSlice(set, get, defaultPaneCleanup),
  ...createSplitTreeSlice(set, get, defaultPaneCleanup),
  ...createNavigationSlice(set, get),
}));

export async function initializeWorkspaceStore(): Promise<void> {
  const persistedState = await window.api.workspaceState.load();
  const normalizedState = persistedState ? normalizePersistedWorkspaceState(persistedState) : null;
  applyWorkspaceSnapshot(normalizedState);
}

export function resetWorkspaceStoreToDefaults(): void {
  applyWorkspaceSnapshot(null);
}

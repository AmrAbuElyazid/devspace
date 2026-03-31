import { create } from "zustand";
import type { WorkspaceState } from "./workspace-state";
import { buildInitialState, setupPersistence } from "./persistence";
import { createUIStateSlice } from "./slices/ui-state";
import { createSidebarTreeSlice } from "./slices/sidebar-tree";
import { createPaneManagementSlice } from "./slices/pane-management";
import { createGroupTabsSlice } from "./slices/group-tabs";
import { createWorkspaceCrudSlice } from "./slices/workspace-crud";
import { createSplitTreeSlice } from "./slices/split-tree";
import { createNavigationSlice } from "./slices/navigation";

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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...buildInitialState(),
  ...createUIStateSlice(set),
  ...createSidebarTreeSlice(set, get),
  ...createPaneManagementSlice(set, get),
  ...createGroupTabsSlice(set, get),
  ...createWorkspaceCrudSlice(set, get),
  ...createSplitTreeSlice(set, get),
  ...createNavigationSlice(set, get),
}));

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

setupPersistence(useWorkspaceStore);

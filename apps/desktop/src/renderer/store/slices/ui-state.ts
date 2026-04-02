import type { WorkspaceState, StoreSet } from "../workspace-state";

type UIStateSlice = Pick<
  WorkspaceState,
  | "pendingEditId"
  | "pendingEditType"
  | "clearPendingEdit"
  | "tabHistoryByGroupId"
  | "recentTabTraversalByGroupId"
>;

export function createUIStateSlice(_set: StoreSet): UIStateSlice {
  return {
    pendingEditId: null,
    pendingEditType: null,
    tabHistoryByGroupId: {},
    recentTabTraversalByGroupId: {},
    clearPendingEdit: () => _set({ pendingEditId: null, pendingEditType: null }),
  };
}

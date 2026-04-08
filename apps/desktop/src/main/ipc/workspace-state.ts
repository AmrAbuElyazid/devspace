import { app } from "electron";
import { safeHandle } from "./shared";
import { WorkspacePersistenceStore } from "../workspace-persistence-store";
import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";

export function registerWorkspaceStateIpc(): void {
  const persistenceStore = new WorkspacePersistenceStore(app.getPath("userData"));

  safeHandle("workspaceState:load", async () => {
    return persistenceStore.load();
  });

  safeHandle("workspaceState:save", async (_event, snapshot: PersistedWorkspaceState) => {
    await persistenceStore.save(snapshot);
  });
}

import { app, type IpcMainEvent } from "electron";
import { safeHandle, safeOn } from "./shared";
import { WorkspacePersistenceStore } from "../workspace-persistence-store";
import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaneConfigValid(type: string, config: unknown): boolean {
  if (!isRecord(config)) {
    return false;
  }

  if (type === "terminal") {
    return config.cwd === undefined || typeof config.cwd === "string";
  }
  if (type === "browser") {
    return (
      typeof config.url === "string" &&
      (config.zoom === undefined || typeof config.zoom === "number")
    );
  }
  if (type === "editor") {
    return config.folderPath === undefined || typeof config.folderPath === "string";
  }
  if (type === "t3code") {
    return Object.keys(config).length === 0;
  }
  if (type === "note") {
    return typeof config.noteId === "string";
  }

  return false;
}

function isValidPersistedWorkspaceState(value: unknown): value is PersistedWorkspaceState {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.activeWorkspaceId !== "string" ||
    !Array.isArray(value.workspaces) ||
    !Array.isArray(value.pinnedSidebarNodes) ||
    !Array.isArray(value.sidebarTree) ||
    !isRecord(value.panes) ||
    !isRecord(value.paneGroups)
  ) {
    return false;
  }

  for (const workspace of value.workspaces) {
    if (!isRecord(workspace)) {
      return false;
    }
    if (
      typeof workspace.id !== "string" ||
      typeof workspace.name !== "string" ||
      typeof workspace.lastActiveAt !== "number" ||
      !isRecord(workspace.root)
    ) {
      return false;
    }
  }

  for (const pane of Object.values(value.panes)) {
    if (!isRecord(pane)) {
      return false;
    }
    if (
      typeof pane.id !== "string" ||
      typeof pane.title !== "string" ||
      typeof pane.type !== "string" ||
      !isPaneConfigValid(pane.type, pane.config)
    ) {
      return false;
    }
  }

  for (const group of Object.values(value.paneGroups)) {
    if (!isRecord(group)) {
      return false;
    }
    if (
      typeof group.id !== "string" ||
      typeof group.activeTabId !== "string" ||
      !Array.isArray(group.tabs)
    ) {
      return false;
    }
  }

  return true;
}

function handleSaveSync(
  event: IpcMainEvent,
  persistenceStore: WorkspacePersistenceStore,
  snapshot: unknown,
): void {
  if (!isValidPersistedWorkspaceState(snapshot)) {
    event.returnValue = { ok: false, error: "Invalid workspace state" };
    return;
  }

  try {
    persistenceStore.save(snapshot);
    event.returnValue = { ok: true };
  } catch (error) {
    event.returnValue = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function registerWorkspaceStateIpc(): void {
  const persistenceStore = new WorkspacePersistenceStore(app.getPath("userData"));

  safeHandle("workspaceState:load", async () => {
    return persistenceStore.load();
  });

  safeHandle("workspaceState:save", async (_event, snapshot: unknown) => {
    if (!isValidPersistedWorkspaceState(snapshot)) {
      throw new Error("Invalid workspace state");
    }

    persistenceStore.save(snapshot);
  });

  safeOn("workspaceState:saveSync", (event, snapshot: unknown) => {
    handleSaveSync(event, persistenceStore, snapshot);
  });
}

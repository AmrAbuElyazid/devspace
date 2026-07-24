import { app, type IpcMainEvent } from "electron";
import { safeHandle, safeOn } from "./shared";
import { WorkspacePersistenceStore } from "../workspace-persistence-store";
import {
  applyPersistedWorkspacePatch,
  type PersistedWorkspacePatch,
  type PersistedWorkspaceState,
} from "../../shared/workspace-persistence";

const MAX_WORKSPACE_STATE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSPACES = 500;
const MAX_PANES = 5000;
const MAX_PANE_GROUPS = 5000;
const MAX_TABS_PER_GROUP = 500;
const MAX_STRING_LENGTH = 4096;
const MAX_SPLIT_DEPTH = 64;

const PATCH_KEYS = new Set([
  "workspaces",
  "activeWorkspaceId",
  "panes",
  "paneGroups",
  "pinnedSidebarNodes",
  "sidebarTree",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_STRING_LENGTH;
}

function isOptionalSafeString(value: unknown): value is string | undefined {
  return value === undefined || isSafeString(value);
}

function isNullableSafeString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || isSafeString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPayloadTooLarge(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_WORKSPACE_STATE_BYTES;
  } catch {
    return true;
  }
}

function isSplitNodeValid(value: unknown, paneGroupIds: Set<string>, depth = 0): boolean {
  if (!isRecord(value) || depth > MAX_SPLIT_DEPTH) return false;
  if (value.type === "leaf") {
    return isSafeString(value.groupId) && paneGroupIds.has(value.groupId);
  }
  if (value.type !== "branch") return false;
  if (value.direction !== "horizontal" && value.direction !== "vertical") return false;
  if (!Array.isArray(value.children) || value.children.length < 2) return false;
  if (!Array.isArray(value.sizes) || value.sizes.length !== value.children.length) return false;
  if (!value.sizes.every((size) => isFiniteNumber(size) && size >= 0)) return false;
  return value.children.every((child) => isSplitNodeValid(child, paneGroupIds, depth + 1));
}

function isSidebarNodeValid(value: unknown, workspaceIds: Set<string>, depth = 0): boolean {
  if (!isRecord(value) || depth > MAX_SPLIT_DEPTH) return false;
  if (value.type === "workspace") {
    return isSafeString(value.workspaceId) && workspaceIds.has(value.workspaceId);
  }
  if (value.type !== "folder") return false;
  if (
    !isSafeString(value.id) ||
    !isSafeString(value.name) ||
    typeof value.collapsed !== "boolean"
  ) {
    return false;
  }
  if (!Array.isArray(value.children)) return false;
  return value.children.every((child) => isSidebarNodeValid(child, workspaceIds, depth + 1));
}

function isPaneConfigValid(type: string, config: unknown): boolean {
  if (!isRecord(config)) {
    return false;
  }

  if (type === "terminal") {
    if (!isOptionalSafeString(config.cwd)) return false;
    if (config.backend === undefined || config.backend === "direct") return true;
    if (config.backend === "managed-tmux") return isSafeString(config.sessionId);
    if (config.backend === "external-tmux") {
      return isSafeString(config.sessionName) && isOptionalSafeString(config.socketPath);
    }
    return false;
  }
  if (type === "browser") {
    return isSafeString(config.url) && (config.zoom === undefined || isFiniteNumber(config.zoom));
  }
  if (type === "editor") {
    return isOptionalSafeString(config.folderPath);
  }
  if (type === "t3code") {
    return Object.keys(config).length === 0;
  }
  if (type === "note") {
    return isSafeString(config.noteId);
  }

  return false;
}

function isValidPersistedWorkspaceState(value: unknown): value is PersistedWorkspaceState {
  if (!isRecord(value)) {
    return false;
  }

  if (isPayloadTooLarge(value)) return false;

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

  if (
    value.workspaces.length > MAX_WORKSPACES ||
    Object.keys(value.panes).length > MAX_PANES ||
    Object.keys(value.paneGroups).length > MAX_PANE_GROUPS
  ) {
    return false;
  }

  if (!value.workspaces.every(isRecord)) return false;

  const workspaceIds = new Set<string>();
  for (const workspace of value.workspaces) {
    if (!isSafeString(workspace.id)) return false;
    workspaceIds.add(workspace.id);
  }
  const paneIds = new Set(Object.keys(value.panes));
  const paneGroupIds = new Set(Object.keys(value.paneGroups));

  if (workspaceIds.size !== value.workspaces.length) return false;
  if (!workspaceIds.has(value.activeWorkspaceId)) return false;

  for (const workspace of value.workspaces) {
    if (
      !isSafeString(workspace.id) ||
      !isSafeString(workspace.name) ||
      !isFiniteNumber(workspace.lastActiveAt) ||
      (workspace.pinned !== undefined && typeof workspace.pinned !== "boolean") ||
      !isSplitNodeValid(workspace.root, paneGroupIds) ||
      !isNullableSafeString(workspace.focusedGroupId) ||
      !isNullableSafeString(workspace.zoomedGroupId) ||
      !isOptionalSafeString(workspace.lastTerminalCwd)
    ) {
      return false;
    }
  }

  for (const [paneId, pane] of Object.entries(value.panes)) {
    if (!isRecord(pane)) {
      return false;
    }
    if (
      pane.id !== paneId ||
      !isSafeString(pane.id) ||
      !isSafeString(pane.title) ||
      typeof pane.type !== "string" ||
      !isPaneConfigValid(pane.type, pane.config)
    ) {
      return false;
    }
  }

  for (const [groupId, group] of Object.entries(value.paneGroups)) {
    if (!isRecord(group)) {
      return false;
    }
    if (
      group.id !== groupId ||
      !isSafeString(group.id) ||
      !isSafeString(group.activeTabId) ||
      !Array.isArray(group.tabs) ||
      group.tabs.length > MAX_TABS_PER_GROUP
    ) {
      return false;
    }

    const tabIds = new Set<string>();
    for (const tab of group.tabs) {
      if (!isRecord(tab) || !isSafeString(tab.id) || !isSafeString(tab.paneId)) return false;
      if (tabIds.has(tab.id) || !paneIds.has(tab.paneId)) return false;
      tabIds.add(tab.id);
    }
    if (!tabIds.has(group.activeTabId)) return false;
  }

  if (!value.sidebarTree.every((node) => isSidebarNodeValid(node, workspaceIds))) return false;
  if (!value.pinnedSidebarNodes.every((node) => isSidebarNodeValid(node, workspaceIds)))
    return false;

  return true;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isUniqueSafeStringArray(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every(isSafeString) &&
    new Set(value).size === value.length
  );
}

function isEntityPatchValid(value: unknown, maxEntities: number, allowOrder: boolean): boolean {
  if (!isRecord(value)) return false;
  const allowedKeys = allowOrder
    ? new Set(["upsert", "removeIds", "orderedIds"])
    : new Set(["upsert", "removeIds"]);
  if (!hasOnlyKeys(value, allowedKeys)) return false;
  if (!Array.isArray(value.upsert) || value.upsert.length > maxEntities) return false;
  if (!value.upsert.every((entity) => isRecord(entity) && isSafeString(entity.id))) return false;
  const removeIds = value.removeIds;
  if (!isUniqueSafeStringArray(removeIds, maxEntities)) return false;

  const upsertIds = value.upsert.map((entity) => entity.id as string);
  if (new Set(upsertIds).size !== upsertIds.length) return false;
  if (upsertIds.some((id) => removeIds.includes(id))) return false;

  if ("orderedIds" in value) {
    if (!allowOrder || !isUniqueSafeStringArray(value.orderedIds, maxEntities)) return false;
  }

  return true;
}

function isValidPersistedWorkspacePatch(value: unknown): value is PersistedWorkspacePatch {
  if (!isRecord(value) || isPayloadTooLarge(value) || !hasOnlyKeys(value, PATCH_KEYS)) {
    return false;
  }

  if ("activeWorkspaceId" in value && !isSafeString(value.activeWorkspaceId)) return false;
  if ("workspaces" in value && !isEntityPatchValid(value.workspaces, MAX_WORKSPACES, true)) {
    return false;
  }
  if ("panes" in value && !isEntityPatchValid(value.panes, MAX_PANES, false)) return false;
  if ("paneGroups" in value && !isEntityPatchValid(value.paneGroups, MAX_PANE_GROUPS, false)) {
    return false;
  }
  if ("pinnedSidebarNodes" in value && !Array.isArray(value.pinnedSidebarNodes)) return false;
  if ("sidebarTree" in value && !Array.isArray(value.sidebarTree)) return false;

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

let persistenceStore: WorkspacePersistenceStore | null = null;
let closeRegistered = false;

export function registerWorkspaceStateIpc(): void {
  persistenceStore ??= new WorkspacePersistenceStore(app.getPath("userData"));
  const store = persistenceStore;

  if (!closeRegistered && typeof app.once === "function") {
    closeRegistered = true;
    app.once("will-quit", () => {
      store.close();
      persistenceStore = null;
      closeRegistered = false;
    });
  }

  safeHandle("workspaceState:load", async () => {
    return store.load();
  });

  safeHandle("workspaceState:save", async (_event, snapshot: unknown) => {
    if (!isValidPersistedWorkspaceState(snapshot)) {
      throw new Error("Invalid workspace state");
    }

    store.save(snapshot);
  });

  safeHandle("workspaceState:patch", async (_event, patch: unknown) => {
    if (!isValidPersistedWorkspacePatch(patch)) {
      throw new Error("Invalid workspace state patch");
    }

    const current = store.getCurrentSnapshot();
    if (!current) return { needsFullSave: true } as const;

    const next = applyPersistedWorkspacePatch(current, patch);
    if (!isValidPersistedWorkspaceState(next)) {
      throw new Error("Invalid workspace state patch result");
    }

    store.save(next);
    return { ok: true } as const;
  });

  safeOn("workspaceState:saveSync", (event, snapshot: unknown) => {
    handleSaveSync(event, store, snapshot);
  });
}

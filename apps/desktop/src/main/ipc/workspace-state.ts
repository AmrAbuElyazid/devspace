import { app, type IpcMainEvent } from "electron";
import { safeHandle, safeOn } from "./shared";
import { WorkspacePersistenceStore } from "../workspace-persistence-store";
import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";

const MAX_WORKSPACE_STATE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSPACES = 500;
const MAX_PANES = 5000;
const MAX_PANE_GROUPS = 5000;
const MAX_TABS_PER_GROUP = 500;
const MAX_STRING_LENGTH = 4096;
const MAX_SPLIT_DEPTH = 64;

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
    return isOptionalSafeString(config.cwd);
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

  const workspaceIds = new Set(value.workspaces.map((workspace) => workspace.id));
  const paneIds = new Set(Object.keys(value.panes));
  const paneGroupIds = new Set(Object.keys(value.paneGroups));

  if (!workspaceIds.has(value.activeWorkspaceId)) return false;

  for (const workspace of value.workspaces) {
    if (!isRecord(workspace)) {
      return false;
    }
    if (
      !isSafeString(workspace.id) ||
      !isSafeString(workspace.name) ||
      !isFiniteNumber(workspace.lastActiveAt) ||
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

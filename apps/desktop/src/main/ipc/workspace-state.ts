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

function isWorkspaceOrderPatchConsistent(
  current: PersistedWorkspaceState,
  patch: PersistedWorkspacePatch,
): boolean {
  const workspacePatch = patch.workspaces;
  if (!workspacePatch?.orderedIds) return true;

  const expectedIds = new Set(current.workspaces.map((workspace) => workspace.id));
  for (const id of workspacePatch.removeIds) expectedIds.delete(id);
  for (const workspace of workspacePatch.upsert) expectedIds.add(workspace.id);

  return (
    workspacePatch.orderedIds.length === expectedIds.size &&
    workspacePatch.orderedIds.every((id) => expectedIds.has(id))
  );
}

function isWorkspaceEntityValid(
  workspace: unknown,
  paneGroupIds: Set<string>,
): workspace is PersistedWorkspaceState["workspaces"][number] {
  return (
    isRecord(workspace) &&
    isSafeString(workspace.id) &&
    isSafeString(workspace.name) &&
    isFiniteNumber(workspace.lastActiveAt) &&
    (workspace.pinned === undefined || typeof workspace.pinned === "boolean") &&
    isSplitNodeValid(workspace.root, paneGroupIds) &&
    isNullableSafeString(workspace.focusedGroupId) &&
    isNullableSafeString(workspace.zoomedGroupId) &&
    isOptionalSafeString(workspace.lastTerminalCwd)
  );
}

function isPaneEntityValid(paneId: string, pane: unknown): boolean {
  return (
    isRecord(pane) &&
    pane.id === paneId &&
    isSafeString(pane.id) &&
    isSafeString(pane.title) &&
    typeof pane.type === "string" &&
    isPaneConfigValid(pane.type, pane.config)
  );
}

function isPaneGroupEntityValid(groupId: string, group: unknown, paneIds: Set<string>): boolean {
  if (
    !isRecord(group) ||
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
  return tabIds.has(group.activeTabId);
}

function isPatchResultValidIncrementally(
  current: PersistedWorkspaceState,
  patch: PersistedWorkspacePatch,
  next: PersistedWorkspaceState,
): boolean {
  if (
    next.workspaces.length > MAX_WORKSPACES ||
    Object.keys(next.panes).length > MAX_PANES ||
    Object.keys(next.paneGroups).length > MAX_PANE_GROUPS
  ) {
    return false;
  }

  const workspaceIds = new Set(next.workspaces.map((workspace) => workspace.id));
  if (workspaceIds.size !== next.workspaces.length || !workspaceIds.has(next.activeWorkspaceId)) {
    return false;
  }

  // Only patches that touch groups or workspaces need to resolve the owners
  // those entities point at. The common patch — a retitled pane, a new tab —
  // reads neither, and building both would walk every pane and every group for
  // nothing. Built at most once each.
  let paneIds: Set<string> | null = null;
  const getPaneIds = (): Set<string> => (paneIds ??= new Set(Object.keys(next.panes)));
  let paneGroupIds: Set<string> | null = null;
  const getPaneGroupIds = (): Set<string> =>
    (paneGroupIds ??= new Set(Object.keys(next.paneGroups)));

  for (const workspace of patch.workspaces?.upsert ?? []) {
    if (!isWorkspaceEntityValid(workspace, getPaneGroupIds())) return false;
  }
  for (const pane of patch.panes?.upsert ?? []) {
    if (!isPaneEntityValid(pane.id, pane)) return false;
  }
  for (const group of patch.paneGroups?.upsert ?? []) {
    if (!isPaneGroupEntityValid(group.id, group, getPaneIds())) return false;
  }

  // Entity removals can invalidate unchanged owners, so only those rarer
  // operations require scanning the corresponding owner collection.
  if (patch.panes?.removeIds.length) {
    for (const [groupId, group] of Object.entries(next.paneGroups)) {
      if (!isPaneGroupEntityValid(groupId, group, getPaneIds())) return false;
    }
  }
  if (patch.paneGroups?.removeIds.length) {
    for (const workspace of next.workspaces) {
      if (!isWorkspaceEntityValid(workspace, getPaneGroupIds())) return false;
    }
  }

  const workspaceIdsChanged =
    Boolean(patch.workspaces?.removeIds.length) ||
    (patch.workspaces?.upsert ?? []).some(
      (workspace) => !current.workspaces.some((existing) => existing.id === workspace.id),
    );
  if (patch.sidebarTree || workspaceIdsChanged) {
    if (!next.sidebarTree.every((node) => isSidebarNodeValid(node, workspaceIds))) return false;
  }
  if (patch.pinnedSidebarNodes || workspaceIdsChanged) {
    if (!next.pinnedSidebarNodes.every((node) => isSidebarNodeValid(node, workspaceIds))) {
      return false;
    }
  }

  return true;
}

function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function collectionCommaBytes(count: number): number {
  return Math.max(0, count - 1);
}

function workspacePatchSizeDelta(
  current: PersistedWorkspaceState,
  patch: NonNullable<PersistedWorkspacePatch["workspaces"]>,
): number {
  const currentById = new Map(current.workspaces.map((workspace) => [workspace.id, workspace]));
  let nextCount = current.workspaces.length;
  let delta = 0;

  for (const id of patch.removeIds) {
    const existing = currentById.get(id);
    if (!existing) continue;
    delta -= jsonByteSize(existing);
    nextCount -= 1;
    currentById.delete(id);
  }
  for (const workspace of patch.upsert) {
    const existing = currentById.get(workspace.id);
    if (existing) delta -= jsonByteSize(existing);
    else nextCount += 1;
    delta += jsonByteSize(workspace);
    currentById.set(workspace.id, workspace);
  }

  return delta + collectionCommaBytes(nextCount) - collectionCommaBytes(current.workspaces.length);
}

function recordPatchSizeDelta<T extends { id: string }>(
  current: Record<string, T>,
  patch: { upsert: T[]; removeIds: string[] },
): number {
  const memberSize = (id: string, entity: T): number => jsonByteSize(id) + 1 + jsonByteSize(entity);
  let nextCount = Object.keys(current).length;
  let delta = 0;

  for (const id of patch.removeIds) {
    const existing = Object.prototype.hasOwnProperty.call(current, id) ? current[id] : undefined;
    if (!existing) continue;
    delta -= memberSize(id, existing);
    nextCount -= 1;
  }
  for (const entity of patch.upsert) {
    const existing = Object.prototype.hasOwnProperty.call(current, entity.id)
      ? current[entity.id]
      : undefined;
    if (existing) delta -= memberSize(entity.id, existing);
    else nextCount += 1;
    delta += memberSize(entity.id, entity);
  }

  return (
    delta + collectionCommaBytes(nextCount) - collectionCommaBytes(Object.keys(current).length)
  );
}

function getPatchedStateSize(
  currentSize: number,
  current: PersistedWorkspaceState,
  patch: PersistedWorkspacePatch,
): number {
  let nextSize = currentSize;
  if (patch.workspaces) nextSize += workspacePatchSizeDelta(current, patch.workspaces);
  if (patch.panes) nextSize += recordPatchSizeDelta(current.panes, patch.panes);
  if (patch.paneGroups) nextSize += recordPatchSizeDelta(current.paneGroups, patch.paneGroups);
  if (patch.activeWorkspaceId !== undefined) {
    nextSize += jsonByteSize(patch.activeWorkspaceId) - jsonByteSize(current.activeWorkspaceId);
  }
  if (patch.sidebarTree !== undefined) {
    nextSize += jsonByteSize(patch.sidebarTree) - jsonByteSize(current.sidebarTree);
  }
  if (patch.pinnedSidebarNodes !== undefined) {
    nextSize += jsonByteSize(patch.pinnedSidebarNodes) - jsonByteSize(current.pinnedSidebarNodes);
  }
  return nextSize;
}

let validatedSnapshot: PersistedWorkspaceState | null = null;
let validatedSnapshotSize = 0;

function rememberValidatedSnapshot(snapshot: PersistedWorkspaceState, size?: number): void {
  validatedSnapshot = snapshot;
  validatedSnapshotSize = size ?? jsonByteSize(snapshot);
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
    rememberValidatedSnapshot(snapshot);
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
      validatedSnapshot = null;
      validatedSnapshotSize = 0;
      closeRegistered = false;
    });
  }

  safeHandle("workspaceState:load", async () => {
    const snapshot = store.load();
    if (!snapshot) {
      validatedSnapshot = null;
      validatedSnapshotSize = 0;
      return null;
    }
    if (!isValidPersistedWorkspaceState(snapshot)) {
      // store.load() has already cached this snapshot as the incremental
      // baseline. The renderer recovers from this throw by starting fresh, so
      // the baseline has to be dropped with it — otherwise every later patch
      // is validated against the state we just rejected, fails, and the
      // session runs to completion without persisting anything.
      store.discardCachedSnapshot();
      validatedSnapshot = null;
      validatedSnapshotSize = 0;
      throw new Error("Invalid persisted workspace state");
    }
    rememberValidatedSnapshot(snapshot);
    return snapshot;
  });

  safeHandle("workspaceState:save", async (_event, snapshot: unknown) => {
    if (!isValidPersistedWorkspaceState(snapshot)) {
      throw new Error("Invalid workspace state");
    }

    store.save(snapshot);
    rememberValidatedSnapshot(snapshot);
  });

  safeHandle("workspaceState:patch", async (_event, patch: unknown) => {
    if (!isValidPersistedWorkspacePatch(patch)) {
      throw new Error("Invalid workspace state patch");
    }

    const current = store.getCurrentSnapshot();
    if (!current) return { needsFullSave: true } as const;
    if (validatedSnapshot !== current) {
      if (!isValidPersistedWorkspaceState(current)) {
        // Nothing can be patched onto a baseline we cannot validate. Drop it
        // and ask for a full save rather than throwing, so the renderer
        // replaces the bad state instead of retrying against it forever.
        store.discardCachedSnapshot();
        validatedSnapshot = null;
        validatedSnapshotSize = 0;
        return { needsFullSave: true } as const;
      }
      rememberValidatedSnapshot(current);
    }
    if (!isWorkspaceOrderPatchConsistent(current, patch)) {
      throw new Error("Invalid workspace ordering patch");
    }

    const next = applyPersistedWorkspacePatch(current, patch);
    const nextSize = getPatchedStateSize(validatedSnapshotSize, current, patch);
    if (
      nextSize > MAX_WORKSPACE_STATE_BYTES ||
      !isPatchResultValidIncrementally(current, patch, next)
    ) {
      throw new Error("Invalid workspace state patch result");
    }

    store.save(next);
    rememberValidatedSnapshot(next, nextSize);
    return { ok: true } as const;
  });

  safeOn("workspaceState:saveSync", (event, snapshot: unknown) => {
    handleSaveSync(event, store, snapshot);
  });
}

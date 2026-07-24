// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PersistedWorkspaceState } from "../../shared/workspace-persistence";
import type { WorkspaceState } from "./workspace-state";
import { buildPersistedWorkspacePatch, setupPersistence } from "./persistence";
import { installMockWindowApi } from "../test-utils/mock-window-api";

function createState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspaces: [],
    activeWorkspaceId: "workspace-1",
    panes: {},
    paneGroups: {},
    pinnedSidebarNodes: [],
    sidebarTree: [],
    pendingEditId: null,
    pendingEditType: null,
    clearPendingEdit: vi.fn(),
    addWorkspace: vi.fn(),
    removeWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    setActiveWorkspace: vi.fn(),
    togglePinWorkspace: vi.fn(),
    pinWorkspace: vi.fn(),
    unpinWorkspace: vi.fn(),
    pinFolder: vi.fn(),
    unpinFolder: vi.fn(),
    reorderSidebarNode: vi.fn(),
    moveSidebarNode: vi.fn(),
    addFolder: vi.fn(),
    removeFolder: vi.fn(),
    renameFolder: vi.fn(),
    toggleFolderCollapsed: vi.fn(),
    expandFolder: vi.fn(),
    setFocusedGroup: vi.fn(),
    addGroupTab: vi.fn(),
    removeGroupTab: vi.fn(),
    setActiveGroupTab: vi.fn(),
    reorderGroupTabs: vi.fn(),
    moveTabToGroup: vi.fn(),
    splitGroupWithTab: vi.fn(),
    moveTabToWorkspace: vi.fn(),
    mergeWorkspaceIntoGroup: vi.fn(),
    splitGroupWithWorkspace: vi.fn(),
    createWorkspaceFromTab: vi.fn(),
    openBrowserInGroup: vi.fn(),
    openEditorTab: vi.fn(),
    setZoomedGroup: vi.fn(),
    clearZoomedGroup: vi.fn(),
    navigateSplit: vi.fn(),
    ...overrides,
  } as WorkspaceState;
}

beforeEach(() => {
  vi.useFakeTimers();
  installMockWindowApi();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("setupPersistence ignores ui-only changes and persists structural changes after debounce", async () => {
  const patchSpy = vi.spyOn(window.api.workspaceState, "patch");

  let currentState = createState({
    workspaces: [{ id: "workspace-1", name: "Workspace 1" }] as WorkspaceState["workspaces"],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  });

  let subscriber: ((state: WorkspaceState) => void) | null = null;
  const store = {
    subscribe(fn: (state: WorkspaceState) => void) {
      subscriber = fn;
    },
    getState() {
      return currentState;
    },
  };

  setupPersistence(store);
  const notify = subscriber as ((state: WorkspaceState) => void) | null;
  expect(notify).toBeTypeOf("function");
  if (!notify) {
    throw new Error("expected setupPersistence to register a subscriber");
  }

  currentState = { ...currentState, pendingEditId: "workspace-1", pendingEditType: "workspace" };
  notify(currentState);
  vi.advanceTimersByTime(500);
  await vi.runAllTimersAsync();

  expect(patchSpy).not.toHaveBeenCalled();

  currentState = {
    ...currentState,
    workspaces: [
      ...currentState.workspaces,
      { id: "workspace-2", name: "Workspace 2" },
    ] as WorkspaceState["workspaces"],
    sidebarTree: [...currentState.sidebarTree, { type: "workspace", workspaceId: "workspace-2" }],
  };
  notify(currentState);
  vi.advanceTimersByTime(500);
  await vi.runAllTimersAsync();

  expect(patchSpy).toHaveBeenCalledTimes(1);
  expect(patchSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaces: {
        upsert: [expect.objectContaining({ id: "workspace-2", name: "Workspace 2" })],
        removeIds: [],
        orderedIds: ["workspace-1", "workspace-2"],
      },
      sidebarTree: expect.arrayContaining([
        expect.objectContaining({ type: "workspace", workspaceId: "workspace-2" }),
      ]),
    }),
  );
});

test("setupPersistence falls back to a full save when main has no baseline", async () => {
  vi.spyOn(window.api.workspaceState, "patch").mockResolvedValue({ needsFullSave: true });
  const saveSpy = vi.spyOn(window.api.workspaceState, "save");

  let currentState = createState({
    workspaces: [{ id: "workspace-1", name: "Workspace 1" }] as WorkspaceState["workspaces"],
  });
  let subscriber: ((state: WorkspaceState) => void) | null = null;
  const store = {
    subscribe(fn: (state: WorkspaceState) => void) {
      subscriber = fn;
    },
    getState: () => currentState,
  };

  setupPersistence(store);
  currentState = {
    ...currentState,
    workspaces: [
      { ...currentState.workspaces[0]!, name: "Renamed" },
    ] as WorkspaceState["workspaces"],
  };
  subscriber!(currentState);

  await vi.advanceTimersByTimeAsync(500);
  await Promise.resolve();

  expect(saveSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaces: [expect.objectContaining({ name: "Renamed" })],
    }),
  );
});

test("buildPersistedWorkspacePatch sends only changed and removed entities", () => {
  const workspace: PersistedWorkspaceState["workspaces"][number] = {
    id: "workspace-1",
    name: "Workspace 1",
    root: { type: "leaf", groupId: "group-1" },
    focusedGroupId: null,
    zoomedGroupId: null,
    lastActiveAt: 1,
  };
  const removedPane = {
    id: "pane-1",
    title: "One",
    type: "terminal" as const,
    config: {},
  };
  const changedPane = {
    id: "pane-2",
    title: "Two",
    type: "terminal" as const,
    config: {},
  };
  const unchangedPane = {
    id: "pane-3",
    title: "Three",
    type: "terminal" as const,
    config: {},
  };
  const previous: PersistedWorkspaceState = {
    workspaces: [workspace],
    activeWorkspaceId: "workspace-1",
    panes: { "pane-1": removedPane, "pane-2": changedPane, "pane-3": unchangedPane },
    paneGroups: {},
    pinnedSidebarNodes: [],
    sidebarTree: [],
  };
  const replacementPane = { ...changedPane, title: "Renamed" };
  const next: PersistedWorkspaceState = {
    ...previous,
    panes: { "pane-2": replacementPane, "pane-3": unchangedPane },
  };

  expect(buildPersistedWorkspacePatch(previous, next)).toEqual({
    panes: { upsert: [replacementPane], removeIds: ["pane-1"] },
  });
});

test("setupPersistence flushes pending state synchronously on beforeunload", () => {
  const saveSyncSpy = vi.spyOn(window.api.workspaceState, "saveSync");

  let currentState = createState({
    workspaces: [{ id: "workspace-1", name: "Workspace 1" }] as WorkspaceState["workspaces"],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  });

  let subscriber: ((state: WorkspaceState) => void) | null = null;
  const store = {
    subscribe(fn: (state: WorkspaceState) => void) {
      subscriber = fn;
    },
    getState() {
      return currentState;
    },
  };

  setupPersistence(store);
  const notify = subscriber as ((state: WorkspaceState) => void) | null;
  if (!notify) {
    throw new Error("expected setupPersistence to register a subscriber");
  }

  currentState = {
    ...currentState,
    workspaces: [
      ...currentState.workspaces,
      { id: "workspace-2", name: "Workspace 2" },
    ] as WorkspaceState["workspaces"],
    sidebarTree: [...currentState.sidebarTree, { type: "workspace", workspaceId: "workspace-2" }],
  };
  notify(currentState);

  window.dispatchEvent(new Event("beforeunload"));

  expect(saveSyncSpy).toHaveBeenCalledTimes(1);
  expect(saveSyncSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaces: expect.arrayContaining([
        expect.objectContaining({ id: "workspace-2", name: "Workspace 2" }),
      ]),
    }),
  );
});

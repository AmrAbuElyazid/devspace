// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { WorkspaceState } from "./workspace-state";
import { setupPersistence } from "./persistence";
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
  const saveSpy = vi.spyOn(window.api.workspaceState, "save");

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

  expect(saveSpy).not.toHaveBeenCalled();

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

  expect(saveSpy).toHaveBeenCalledTimes(1);
  expect(saveSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      activeWorkspaceId: "workspace-1",
      workspaces: expect.arrayContaining([
        expect.objectContaining({ id: "workspace-2", name: "Workspace 2" }),
      ]),
    }),
  );
});

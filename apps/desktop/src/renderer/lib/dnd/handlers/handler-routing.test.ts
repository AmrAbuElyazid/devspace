import { expect, test, vi } from "vitest";
import type { DragItemData } from "../../../types/dnd";
import type { SidebarNode } from "../../../types/workspace";
import type { ResolveContext } from "../types";
import { tabToSidebarHandler } from "./tab-to-sidebar";
import { workspaceToActiveHandler } from "./workspace-to-active";

function createCollision(
  current: Record<string, unknown>,
  rect?: { left: number; top: number; width: number; height: number },
) {
  return {
    data: {
      droppableContainer: {
        data: { current },
        rect: { current: rect },
      },
    },
  };
}

function createStore(overrides: Partial<ReturnType<typeof createStoreState>> = {}) {
  const state = createStoreState(overrides);
  return {
    getState: () => state,
  };
}

function createStoreState(
  overrides: Partial<{
    sidebarTree: SidebarNode[];
    pinnedSidebarNodes: SidebarNode[];
    createWorkspaceFromTab: ReturnType<typeof vi.fn>;
    mergeWorkspaceIntoGroup: ReturnType<typeof vi.fn>;
    splitGroupWithWorkspace: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    sidebarTree: [] as SidebarNode[],
    pinnedSidebarNodes: [] as SidebarNode[],
    createWorkspaceFromTab: vi.fn(),
    mergeWorkspaceIntoGroup: vi.fn(),
    splitGroupWithWorkspace: vi.fn(),
    ...overrides,
  };
}

function createContext(
  drag: DragItemData,
  collisions: ReturnType<typeof createCollision>[],
  pointer: { x: number; y: number },
  store = createStore(),
): ResolveContext {
  return {
    drag,
    collisions: collisions as never,
    pointer,
    store: store as never,
  };
}

test("workspaceToActiveHandler resolves merge intents before split intents", () => {
  const drag: DragItemData = {
    type: "sidebar-workspace",
    workspaceId: "workspace-2",
    container: "main",
    parentFolderId: null,
  };

  const intent = workspaceToActiveHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision({ type: "group-tab", groupId: "group-1", visible: true }),
        createCollision(
          { type: "pane-drop", groupId: "group-2", visible: true },
          { left: 0, top: 0, width: 200, height: 120 },
        ),
      ],
      { x: 10, y: 10 },
    ),
  );

  expect(intent).toEqual({
    kind: "merge-workspace",
    sourceWorkspaceId: "workspace-2",
    targetGroupId: "group-1",
  });
});

test("workspaceToActiveHandler computes split side from pane-drop proximity", () => {
  const drag: DragItemData = {
    type: "sidebar-workspace",
    workspaceId: "workspace-2",
    container: "main",
    parentFolderId: null,
  };

  const intent = workspaceToActiveHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          { type: "pane-drop", groupId: "group-2", visible: true },
          { left: 100, top: 100, width: 300, height: 200 },
        ),
      ],
      { x: 390, y: 180 },
    ),
  );

  expect(intent).toEqual({
    kind: "split-with-workspace",
    sourceWorkspaceId: "workspace-2",
    targetGroupId: "group-2",
    side: "right",
  });
});

test("workspaceToActiveHandler execute dispatches merge and split actions", () => {
  const state = createStoreState();
  const store = { getState: () => state } as never;

  expect(
    workspaceToActiveHandler.execute(
      {
        kind: "merge-workspace",
        sourceWorkspaceId: "workspace-2",
        targetGroupId: "group-1",
      },
      store,
    ),
  ).toBe(true);
  expect(state.mergeWorkspaceIntoGroup).toHaveBeenCalledWith("workspace-2", "group-1");

  expect(
    workspaceToActiveHandler.execute(
      {
        kind: "split-with-workspace",
        sourceWorkspaceId: "workspace-2",
        targetGroupId: "group-3",
        side: "bottom",
      },
      store,
    ),
  ).toBe(true);
  expect(state.splitGroupWithWorkspace).toHaveBeenCalledWith("workspace-2", "group-3", "bottom");
});

test("tabToSidebarHandler drops into folder center by appending to its children", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const store = createStore({
    sidebarTree: [
      {
        type: "folder",
        id: "folder-1",
        name: "Folder One",
        collapsed: false,
        children: [{ type: "workspace", workspaceId: "workspace-9" }],
      },
    ],
  });

  const intent = tabToSidebarHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          {
            type: "sidebar-folder",
            folderId: "folder-1",
            container: "main",
            parentFolderId: null,
            visible: true,
          },
          { left: 0, top: 0, width: 200, height: 100 },
        ),
      ],
      { x: 20, y: 50 },
      store,
    ),
  );

  expect(intent).toEqual({
    kind: "create-workspace-from-tab",
    sourceWorkspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetContainer: "main",
    targetParentFolderId: "folder-1",
    targetIndex: 1,
  });
});

test("tabToSidebarHandler returns null for sidebar workspace center drops so move-to-workspace can handle them", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const intent = tabToSidebarHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          {
            type: "sidebar-workspace",
            workspaceId: "workspace-2",
            container: "main",
            parentFolderId: null,
            visible: true,
          },
          { left: 0, top: 0, width: 200, height: 100 },
        ),
      ],
      { x: 20, y: 50 },
    ),
  );

  expect(intent).toBeNull();
});

test("tabToSidebarHandler creates a new workspace before a sidebar workspace on edge drops", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const store = createStore({
    sidebarTree: [
      { type: "workspace", workspaceId: "workspace-2" },
      { type: "workspace", workspaceId: "workspace-3" },
    ],
  });

  const intent = tabToSidebarHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          {
            type: "sidebar-workspace",
            workspaceId: "workspace-3",
            container: "main",
            parentFolderId: null,
            visible: true,
          },
          { left: 0, top: 0, width: 200, height: 100 },
        ),
      ],
      { x: 20, y: 10 },
      store,
    ),
  );

  expect(intent).toEqual({
    kind: "create-workspace-from-tab",
    sourceWorkspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetContainer: "main",
    targetParentFolderId: null,
    targetIndex: 1,
  });
});

test("tabToSidebarHandler execute dispatches workspace creation", () => {
  const state = createStoreState();

  expect(
    tabToSidebarHandler.execute(
      {
        kind: "create-workspace-from-tab",
        sourceWorkspaceId: "workspace-1",
        sourceGroupId: "group-1",
        sourceTabId: "tab-1",
        targetContainer: "pinned",
        targetParentFolderId: "folder-2",
        targetIndex: 3,
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.createWorkspaceFromTab).toHaveBeenCalledWith("tab-1", "group-1", "workspace-1", {
    parentFolderId: "folder-2",
    container: "pinned",
    insertIndex: 3,
  });
});

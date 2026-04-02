import { expect, test, vi } from "vitest";
import type { DragItemData } from "../../../types/dnd";
import type { SidebarNode } from "../../../types/workspace";
import type { ResolveContext } from "../types";
import { sidebarReorderHandler } from "./sidebar-reorder";
import { tabReorderHandler } from "./tab-reorder";
import { tabSplitHandler } from "./tab-split";
import { tabToSidebarHandler } from "./tab-to-sidebar";
import { tabToWorkspaceHandler } from "./tab-to-workspace";
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
    paneGroups: Record<string, { tabs: { id: string }[] }>;
    sidebarTree: SidebarNode[];
    pinnedSidebarNodes: SidebarNode[];
    createWorkspaceFromTab: ReturnType<typeof vi.fn>;
    expandFolder: ReturnType<typeof vi.fn>;
    mergeWorkspaceIntoGroup: ReturnType<typeof vi.fn>;
    moveTabToGroup: ReturnType<typeof vi.fn>;
    moveTabToWorkspace: ReturnType<typeof vi.fn>;
    moveSidebarNode: ReturnType<typeof vi.fn>;
    reorderGroupTabs: ReturnType<typeof vi.fn>;
    splitGroupWithTab: ReturnType<typeof vi.fn>;
    splitGroupWithWorkspace: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    paneGroups: {},
    sidebarTree: [] as SidebarNode[],
    pinnedSidebarNodes: [] as SidebarNode[],
    createWorkspaceFromTab: vi.fn(),
    expandFolder: vi.fn(),
    mergeWorkspaceIntoGroup: vi.fn(),
    moveTabToGroup: vi.fn(),
    moveTabToWorkspace: vi.fn(),
    moveSidebarNode: vi.fn(),
    reorderGroupTabs: vi.fn(),
    splitGroupWithTab: vi.fn(),
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

test("tabToWorkspaceHandler ignores same-workspace drops", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const intent = tabToWorkspaceHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          {
            type: "sidebar-workspace",
            workspaceId: "workspace-1",
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

test("tabToWorkspaceHandler only accepts the center zone of a workspace target", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const edgeIntent = tabToWorkspaceHandler.resolveIntent(
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
      { x: 20, y: 10 },
    ),
  );

  const centerIntent = tabToWorkspaceHandler.resolveIntent(
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

  expect(edgeIntent).toBeNull();
  expect(centerIntent).toEqual({
    kind: "move-to-workspace",
    sourceWorkspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetWorkspaceId: "workspace-2",
  });
});

test("tabToWorkspaceHandler execute dispatches workspace moves", () => {
  const state = createStoreState();

  expect(
    tabToWorkspaceHandler.execute(
      {
        kind: "move-to-workspace",
        sourceWorkspaceId: "workspace-1",
        sourceGroupId: "group-1",
        sourceTabId: "tab-1",
        targetWorkspaceId: "workspace-2",
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.moveTabToWorkspace).toHaveBeenCalledWith(
    "workspace-1",
    "group-1",
    "tab-1",
    "workspace-2",
  );
});

test("tabReorderHandler resolves the first visible group-tab collision", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const intent = tabReorderHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision({ type: "group-tab", groupId: "group-2", tabId: "tab-5", visible: false }),
        createCollision({ type: "group-tab", groupId: "group-2", tabId: "tab-2", visible: true }),
      ],
      { x: 20, y: 20 },
    ),
  );

  expect(intent).toEqual({
    kind: "reorder-tab",
    workspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetGroupId: "group-2",
    targetTabId: "tab-2",
  });
});

test("tabReorderHandler execute reorders within a group using source and target indexes", () => {
  const state = createStoreState({
    paneGroups: {
      "group-1": {
        tabs: [{ id: "tab-1" }, { id: "tab-2" }, { id: "tab-3" }],
      },
    },
  });

  expect(
    tabReorderHandler.execute(
      {
        kind: "reorder-tab",
        workspaceId: "workspace-1",
        sourceGroupId: "group-1",
        sourceTabId: "tab-1",
        targetGroupId: "group-1",
        targetTabId: "tab-3",
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.reorderGroupTabs).toHaveBeenCalledWith("workspace-1", "group-1", 0, 2);
  expect(state.moveTabToGroup).not.toHaveBeenCalled();
});

test("tabReorderHandler execute moves tabs across groups at the target tab position", () => {
  const state = createStoreState({
    paneGroups: {
      "group-2": {
        tabs: [{ id: "tab-7" }, { id: "tab-8" }],
      },
    },
  });

  expect(
    tabReorderHandler.execute(
      {
        kind: "reorder-tab",
        workspaceId: "workspace-1",
        sourceGroupId: "group-1",
        sourceTabId: "tab-1",
        targetGroupId: "group-2",
        targetTabId: "tab-8",
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.moveTabToGroup).toHaveBeenCalledWith(
    "workspace-1",
    "group-1",
    "tab-1",
    "group-2",
    1,
  );
});

test("tabSplitHandler resolves split direction from pane-drop proximity", () => {
  const drag: DragItemData = {
    type: "group-tab",
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };

  const intent = tabSplitHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          { type: "pane-drop", groupId: "group-3", visible: true },
          { left: 100, top: 100, width: 300, height: 200 },
        ),
      ],
      { x: 120, y: 180 },
    ),
  );

  expect(intent).toEqual({
    kind: "split-group",
    workspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetGroupId: "group-3",
    side: "left",
  });
});

test("tabSplitHandler execute dispatches splitGroupWithTab", () => {
  const state = createStoreState();

  expect(
    tabSplitHandler.execute(
      {
        kind: "split-group",
        workspaceId: "workspace-1",
        sourceGroupId: "group-1",
        sourceTabId: "tab-1",
        targetGroupId: "group-2",
        side: "bottom",
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.splitGroupWithTab).toHaveBeenCalledWith(
    "workspace-1",
    "group-1",
    "tab-1",
    "group-2",
    "bottom",
  );
});

test("sidebarReorderHandler resolves workspace drops into folder center using folder children", () => {
  const drag: DragItemData = {
    type: "sidebar-workspace",
    workspaceId: "workspace-1",
    container: "main",
    parentFolderId: null,
  };

  const store = createStore({
    pinnedSidebarNodes: [
      {
        type: "folder",
        id: "folder-1",
        name: "Pinned Folder",
        collapsed: false,
        children: [{ type: "workspace", workspaceId: "workspace-9" }],
      },
    ],
  });

  const intent = sidebarReorderHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          {
            type: "sidebar-folder",
            folderId: "folder-1",
            container: "pinned",
            parentFolderId: null,
          },
          { left: 0, top: 0, width: 200, height: 100 },
        ),
      ],
      { x: 30, y: 50 },
      store,
    ),
  );

  expect(intent).toEqual({
    kind: "reorder-sidebar",
    nodeId: "workspace-1",
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "pinned",
    targetParentId: "folder-1",
    targetIndex: 1,
  });
});

test("sidebarReorderHandler resolves folder drags onto the root container", () => {
  const drag: DragItemData = {
    type: "sidebar-folder",
    folderId: "folder-9",
    container: "pinned",
    parentFolderId: null,
  };

  const store = createStore({
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-2" }],
    pinnedSidebarNodes: [{ type: "workspace", workspaceId: "workspace-3" }],
  });

  const intent = sidebarReorderHandler.resolveIntent(
    createContext(
      drag,
      [
        createCollision(
          { type: "sidebar-root", container: "main" },
          { left: 0, top: 0, width: 200, height: 300 },
        ),
      ],
      { x: 20, y: 20 },
      store,
    ),
  );

  expect(intent).toEqual({
    kind: "reorder-sidebar",
    nodeId: "folder-9",
    nodeType: "folder",
    sourceContainer: "pinned",
    targetContainer: "main",
    targetParentId: null,
    targetIndex: 1,
  });
});

test("sidebarReorderHandler execute moves the node and expands target folders", () => {
  const state = createStoreState();

  expect(
    sidebarReorderHandler.execute(
      {
        kind: "reorder-sidebar",
        nodeId: "workspace-1",
        nodeType: "workspace",
        sourceContainer: "main",
        targetContainer: "pinned",
        targetParentId: "folder-1",
        targetIndex: 2,
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.moveSidebarNode).toHaveBeenCalledWith({
    nodeId: "workspace-1",
    nodeType: "workspace",
    sourceContainer: "main",
    targetContainer: "pinned",
    targetParentId: "folder-1",
    targetIndex: 2,
  });
  expect(state.expandFolder).toHaveBeenCalledWith("folder-1");
});

test("sidebarReorderHandler execute skips folder expansion for root drops", () => {
  const state = createStoreState();

  expect(
    sidebarReorderHandler.execute(
      {
        kind: "reorder-sidebar",
        nodeId: "folder-9",
        nodeType: "folder",
        sourceContainer: "pinned",
        targetContainer: "main",
        targetParentId: null,
        targetIndex: 0,
      },
      { getState: () => state } as never,
    ),
  ).toBe(true);

  expect(state.moveSidebarNode).toHaveBeenCalledTimes(1);
  expect(state.expandFolder).not.toHaveBeenCalled();
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Sidebar from "./Sidebar";
import { useSettingsStore } from "../store/settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import { useWorkspaceStore } from "../store/workspace-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sidebarShellMocks = vi.hoisted(() => ({
  activeDrag: null as null | {
    type: "group-tab" | "sidebar-workspace" | "sidebar-folder";
    workspaceId?: string;
    groupId?: string;
    tabId?: string;
    folderId?: string;
    container?: "main" | "pinned";
    parentFolderId?: string | null;
  },
  setDroppableNodeRef: vi.fn(),
  contextMenuShow: vi.fn(),
  isFullScreen: vi.fn(),
  onFullScreenChange: vi.fn(),
}));

vi.mock("../App", () => ({
  useModifierHeldContext: () => null,
}));

vi.mock("../hooks/useDndOrchestrator", () => ({
  useDragContext: () => ({ activeDrag: sidebarShellMocks.activeDrag, dropIntent: null }),
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: sidebarShellMocks.setDroppableNodeRef,
    isOver: false,
  }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  verticalListSortingStrategy: "vertical",
}));

vi.mock("./Sidebar/SortableWorkspaceItem", () => ({
  SortableWorkspaceItem: ({
    workspaceId,
    isEditing,
    onContextMenu,
  }: {
    workspaceId: string;
    isEditing: boolean;
    onContextMenu: (event: React.MouseEvent) => void;
  }) => (
    <div
      data-editing={isEditing || undefined}
      data-workspace-id={workspaceId}
      onContextMenu={onContextMenu}
    >
      {workspaceId}
    </div>
  ),
}));

vi.mock("./Sidebar/SortableFolderItem", () => ({
  SortableFolderItem: ({
    folder,
    isEditing,
    onAddWorkspace,
  }: {
    folder: { id: string; name: string };
    isEditing: boolean;
    onAddWorkspace: () => void;
  }) => (
    <div data-editing={isEditing || undefined} data-folder-id={folder.id}>
      {folder.name}
      <button aria-label={`add-workspace-${folder.id}`} onClick={onAddWorkspace} type="button">
        add
      </button>
    </div>
  ),
}));

vi.mock("./ui/button", () => ({
  Button: ({ children, onClick, className }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button className={className} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("./ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("./ui/alert-dialog", () => ({
  AlertDialog: () => null,
}));

let container: HTMLDivElement;
let root: Root | null;
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  sidebarShellMocks.activeDrag = null;
  sidebarShellMocks.setDroppableNodeRef.mockReset();
  sidebarShellMocks.contextMenuShow.mockReset();
  sidebarShellMocks.contextMenuShow.mockResolvedValue(null);
  sidebarShellMocks.isFullScreen.mockReset();
  sidebarShellMocks.isFullScreen.mockResolvedValue(false);
  sidebarShellMocks.onFullScreenChange.mockReset();
  sidebarShellMocks.onFullScreenChange.mockReturnValue(() => {});

  installMockWindowApi({
    terminal: {
      blur: vi.fn(),
    },
    window: {
      focusContent: vi.fn(),
      isFullScreen: sidebarShellMocks.isFullScreen,
      onFullScreenChange: sidebarShellMocks.onFullScreenChange,
    },
    contextMenu: {
      show: sidebarShellMocks.contextMenuShow,
    },
  });

  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "alpha",
        name: "Alpha Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
      {
        id: "beta",
        name: "Beta Workspace",
        root: { type: "leaf", groupId: "group-2" },
        focusedGroupId: "group-2",
        zoomedGroupId: null,
        lastActiveAt: 2,
      },
    ],
    activeWorkspaceId: "alpha",
    pinnedSidebarNodes: [],
    sidebarTree: [
      { type: "workspace", workspaceId: "alpha" },
      { type: "workspace", workspaceId: "beta" },
    ],
    pendingEditId: null,
    pendingEditType: null,
  });

  useSettingsStore.setState({
    sidebarOpen: true,
    sidebarWidth: 240,
    defaultPaneType: "terminal",
    panePickerContext: null,
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
});

test("filters workspaces by search query and clears the filter on Escape", async () => {
  await act(async () => {
    root?.render(<Sidebar />);
  });

  expect(container.innerHTML).toContain('data-workspace-id="alpha"');
  expect(container.innerHTML).toContain('data-workspace-id="beta"');

  const input = container.querySelector(
    'input[aria-label="Search workspaces"]',
  ) as HTMLInputElement;
  expect(input).toBeTruthy();

  await act(async () => {
    setInputValue?.call(input, "alpha");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(container.innerHTML).toContain('data-workspace-id="alpha"');
  expect(container.innerHTML).not.toContain('data-workspace-id="beta"');

  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(input.value).toBe("");
  expect(container.innerHTML).toContain('data-workspace-id="alpha"');
  expect(container.innerHTML).toContain('data-workspace-id="beta"');
});

test("picks up pending workspace edit requests from the store and clears the pending flag", async () => {
  const clearPendingEdit = vi.fn(() => {
    useWorkspaceStore.setState({ pendingEditId: null, pendingEditType: null });
  });

  useWorkspaceStore.setState({
    pendingEditId: "beta",
    pendingEditType: "workspace",
    clearPendingEdit,
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  expect(clearPendingEdit).toHaveBeenCalledTimes(1);
  expect(container.innerHTML).toContain('data-workspace-id="beta"');
  expect(container.innerHTML).toContain('data-editing="true"');
});

test("drops the reserved traffic-light gutter when the native window is fullscreen", async () => {
  sidebarShellMocks.isFullScreen.mockResolvedValue(true);

  await act(async () => {
    root?.render(<Sidebar />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  const header = container.querySelector(".sidebar-header");
  expect(header?.getAttribute("data-fullscreen")).toBe("true");
});

test("picks up pending folder edit requests from the store and clears the pending flag", async () => {
  const clearPendingEdit = vi.fn(() => {
    useWorkspaceStore.setState({ pendingEditId: null, pendingEditType: null });
  });

  useWorkspaceStore.setState({
    sidebarTree: [
      {
        type: "folder",
        id: "folder-1",
        name: "Folder One",
        collapsed: false,
        children: [],
      },
    ],
    pendingEditId: "folder-1",
    pendingEditType: "folder",
    clearPendingEdit,
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  expect(clearPendingEdit).toHaveBeenCalledTimes(1);
  expect(container.innerHTML).toContain('data-folder-id="folder-1"');
  expect(container.innerHTML).toContain('data-editing="true"');
});

test("shows the pinned section during relevant drags even when nothing is pinned", async () => {
  sidebarShellMocks.activeDrag = {
    type: "group-tab",
    workspaceId: "alpha",
    groupId: "group-1",
    tabId: "tab-1",
  };

  await act(async () => {
    root?.render(<Sidebar />);
  });

  expect(container.textContent).toContain("Pinned");
});

test("routes the new workspace button through the pane picker when the default pane type is picker", async () => {
  const openPanePicker = vi.fn();
  useSettingsStore.setState({
    defaultPaneType: "picker",
    openPanePicker,
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  // Index 7: collapse(0), ql-terminal(1), ql-browser(2), ql-vscode(3),
  // ql-t3code(4), ql-note(5), new-folder(6), new-workspace(7)
  const buttons = container.querySelectorAll("button");
  const newWorkspaceButton = buttons[7];
  expect(newWorkspaceButton).toBeTruthy();

  await act(async () => {
    newWorkspaceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(openPanePicker).toHaveBeenCalledWith({ action: "new-workspace", container: "main" });
});

test("routes the new workspace button directly to addWorkspace for concrete default pane types", async () => {
  const addWorkspace = vi.fn();
  useWorkspaceStore.setState({ addWorkspace });
  useSettingsStore.setState({ defaultPaneType: "terminal" });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  // Index 7: collapse(0), ql-terminal(1), ql-browser(2), ql-vscode(3),
  // ql-t3code(4), ql-note(5), new-folder(6), new-workspace(7)
  const buttons = container.querySelectorAll("button");
  const newWorkspaceButton = buttons[7];
  expect(newWorkspaceButton).toBeTruthy();

  await act(async () => {
    newWorkspaceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(addWorkspace).toHaveBeenCalledWith(undefined, null, "main", "terminal");
});

test("workspace context menu can route rename and pin actions", async () => {
  const togglePinWorkspace = vi.fn();
  useWorkspaceStore.setState({ togglePinWorkspace });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const workspace = container.querySelector('[data-workspace-id="alpha"]');
  expect(workspace).toBeTruthy();

  sidebarShellMocks.contextMenuShow.mockResolvedValueOnce("rename");
  await act(async () => {
    workspace?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }),
    );
  });

  expect(sidebarShellMocks.contextMenuShow).toHaveBeenCalledWith(
    expect.arrayContaining([{ id: "rename", label: "Rename" }]),
    { x: 10, y: 20 },
  );
  expect(container.innerHTML).toContain('data-workspace-id="alpha"');
  expect(container.innerHTML).toContain('data-editing="true"');

  sidebarShellMocks.contextMenuShow.mockResolvedValueOnce("pin");
  await act(async () => {
    workspace?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 11, clientY: 21 }),
    );
  });

  expect(togglePinWorkspace).toHaveBeenCalledWith("alpha");
});

test("workspace context menu can create a new folder", async () => {
  const addFolder = vi.fn();
  useWorkspaceStore.setState({ addFolder });

  sidebarShellMocks.contextMenuShow.mockResolvedValueOnce("new-folder");

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const workspace = container.querySelector('[data-workspace-id="beta"]');
  expect(workspace).toBeTruthy();

  await act(async () => {
    workspace?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 14, clientY: 28 }),
    );
  });

  expect(addFolder).toHaveBeenCalledWith("New Folder");
});

test("folder add-workspace routes through the pane picker when the default pane type is picker", async () => {
  const openPanePicker = vi.fn();
  useSettingsStore.setState({ defaultPaneType: "picker", openPanePicker });
  useWorkspaceStore.setState({
    sidebarTree: [
      {
        type: "folder",
        id: "folder-1",
        name: "Folder One",
        collapsed: false,
        children: [],
      },
    ],
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const addButton = container.querySelector('[aria-label="add-workspace-folder-1"]');
  expect(addButton).toBeTruthy();

  await act(async () => {
    addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(openPanePicker).toHaveBeenCalledWith({
    action: "new-workspace",
    parentFolderId: "folder-1",
    container: "main",
  });
});

test("folder add-workspace routes directly to addWorkspace for concrete default pane types", async () => {
  const addWorkspace = vi.fn();
  useWorkspaceStore.setState({
    addWorkspace,
    sidebarTree: [
      {
        type: "folder",
        id: "folder-1",
        name: "Folder One",
        collapsed: false,
        children: [],
      },
    ],
  });
  useSettingsStore.setState({ defaultPaneType: "browser" });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const addButton = container.querySelector('[aria-label="add-workspace-folder-1"]');
  expect(addButton).toBeTruthy();

  await act(async () => {
    addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(addWorkspace).toHaveBeenCalledWith(undefined, "folder-1", "main", "browser");
});

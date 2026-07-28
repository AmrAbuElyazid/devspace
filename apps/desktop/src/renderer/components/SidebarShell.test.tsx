// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Sidebar from "./Sidebar";
import { useSettingsStore } from "../store/settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import { useWorkspaceStore } from "../store/workspace-store";
import { useWindowChromeStore } from "../store/window-chrome-store";
import { TRAFFIC_LIGHT_GUTTER } from "../../shared/chrome";

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
}));

vi.mock("../App", () => ({
  useModifierHeldContext: () => null,
}));

vi.mock("../hooks/useDndOrchestrator", () => ({
  useActiveDrag: () => sidebarShellMocks.activeDrag,
  useDropIntent: () => null,
  useDragContext: () => ({ activeDrag: sidebarShellMocks.activeDrag, dropIntent: null }),
  getActiveDrag: () => sidebarShellMocks.activeDrag,
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
    isSelected,
    onSelect,
    onContextMenu,
  }: {
    workspaceId: string;
    isEditing: boolean;
    isSelected: boolean;
    onSelect: (event: React.MouseEvent) => void;
    onContextMenu: (event: React.MouseEvent) => void;
  }) => (
    <div
      data-editing={isEditing || undefined}
      data-selected={isSelected || undefined}
      data-workspace-id={workspaceId}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {workspaceId}
    </div>
  ),
}));

// The real folder row reads its context-menu handler off SidebarContext rather
// than taking it as a prop, so the stand-in has to do the same or right-click
// would be untestable here.
vi.mock("./Sidebar/SortableFolderItem", async () => {
  const { useSidebarContext } = await import("./Sidebar/SidebarContext");
  return {
    SortableFolderItem: ({
      folder,
      isEditing,
      isSelected,
      onClick,
      onAddWorkspace,
    }: {
      folder: { id: string; name: string };
      isEditing: boolean;
      isSelected: boolean;
      onClick: (event: React.MouseEvent) => void;
      onAddWorkspace: () => void;
    }) => {
      const { onContextMenuFolder } = useSidebarContext();
      return (
        <div
          data-editing={isEditing || undefined}
          data-selected={isSelected || undefined}
          data-folder-id={folder.id}
          onClick={onClick}
          onContextMenu={(event) => onContextMenuFolder(event, folder.id)}
        >
          {folder.name}
          <button aria-label={`add-workspace-${folder.id}`} onClick={onAddWorkspace} type="button">
            add
          </button>
        </div>
      );
    },
  };
});

vi.mock("./ui/button", () => ({
  Button: ({ children, onClick, className }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button className={className} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("./ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./ui/hint-tooltip", () => ({
  HintTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("./ui/alert-dialog", () => ({
  AlertDialog: () => null,
}));

vi.mock("./ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
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
  useWindowChromeStore.setState({ isFullScreen: false, trafficLightGutter: TRAFFIC_LIGHT_GUTTER });

  installMockWindowApi({
    terminal: {
      blur: vi.fn(),
    },
    window: {
      focusContent: vi.fn(),
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

test("reserves the traffic-light gutter in the header and drops it in fullscreen", async () => {
  await act(async () => {
    root?.render(<Sidebar />);
  });

  // The header is the first drag-region child of the sidebar.
  const header = () => container.querySelector<HTMLElement>("aside .drag-region");
  expect(header()?.style.paddingLeft).toBe(`${TRAFFIC_LIGHT_GUTTER}px`);

  await act(async () => {
    useWindowChromeStore.setState({ isFullScreen: true });
  });

  // macOS hides the buttons in fullscreen, so the gutter collapses to the
  // ordinary content inset instead of leaving a hole.
  expect(header()?.style.paddingLeft).toBe("12px");
});

test("renders a restart-to-update pill above settings when an update is downloaded", async () => {
  const installUpdate = vi.fn(async () => true);
  installMockWindowApi({
    app: {
      getUpdateState: vi.fn(async () => ({
        enabled: true,
        status: "downloaded" as const,
        currentVersion: "0.1.0",
        availableVersion: "0.1.1",
        checkedAt: "2026-04-26T05:00:00.000Z",
        downloadPercent: 100,
        message: null,
        disabledReason: null,
      })),
      installUpdate,
      onUpdateStateChanged: vi.fn(() => () => {}),
    },
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(container.textContent).toContain("Restart to update");

  // The update pill renders as a button whose aria-label contains the
  // tooltip-style status sentence.
  const button = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.getAttribute("aria-label")?.includes("downloaded"),
  ) as HTMLButtonElement | undefined;
  expect(button).toBeTruthy();

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(installUpdate).toHaveBeenCalledTimes(1);
});

test("only persists sidebar width when resize ends", async () => {
  await act(async () => {
    root?.render(<Sidebar />);
  });

  const sidebar = container.querySelector("aside[data-state]") as HTMLElement;
  const resizeHandle = container.querySelector(
    '[role="separator"][aria-label="Resize sidebar"]',
  ) as HTMLDivElement;

  expect(sidebar.style.width).toBe("240px");
  expect(useSettingsStore.getState().sidebarWidth).toBe(240);

  // Pointer events with capture on the divider, not document-level mouse
  // events — a release over a native pane never reaches `document`.
  await act(async () => {
    resizeHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
  });

  await act(async () => {
    resizeHandle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 160 }));
  });

  expect(sidebar.style.width).toBe("300px");
  expect(useSettingsStore.getState().sidebarWidth).toBe(240);

  await act(async () => {
    resizeHandle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });

  expect(useSettingsStore.getState().sidebarWidth).toBe(300);
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

test("does not show the pinned section during drag when nothing is pinned", async () => {
  sidebarShellMocks.activeDrag = {
    type: "group-tab",
    workspaceId: "alpha",
    groupId: "group-1",
    tabId: "tab-1",
  };

  await act(async () => {
    root?.render(<Sidebar />);
  });

  expect(container.textContent).not.toContain("Pinned");
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

  const newWorkspaceButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="New workspace"]',
  );
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

  const newWorkspaceButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="New workspace"]',
  );
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

// ── Selection and context menus ───────────────────────────────────────────────

/** Click a sidebar row, optionally with a selection modifier held. */
async function clickRow(
  selector: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
): Promise<void> {
  const row = container.querySelector(selector);
  expect(row).toBeTruthy();
  await act(async () => {
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers }));
  });
}

/** Right-click a row and return the menu items the main process was handed. */
async function openContextMenu(selector: string): Promise<Array<{ id: string; label: string }>> {
  const row = container.querySelector(selector);
  expect(row).toBeTruthy();
  await act(async () => {
    row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  });
  const call = sidebarShellMocks.contextMenuShow.mock.calls.at(-1);
  return (call?.[0] ?? []) as Array<{ id: string; label: string }>;
}

test("a plain click opens a workspace and leaves the bulk bar hidden", async () => {
  const setActiveWorkspace = vi.fn();
  useWorkspaceStore.setState({ setActiveWorkspace });

  await act(async () => {
    root?.render(<Sidebar />);
  });
  await clickRow('[data-workspace-id="beta"]');

  expect(setActiveWorkspace).toHaveBeenCalledWith("beta");
  expect(container.textContent).not.toContain("selected");
});

test("cmd-click marks rows and reveals the bulk action bar", async () => {
  const setActiveWorkspace = vi.fn();
  useWorkspaceStore.setState({ setActiveWorkspace });

  await act(async () => {
    root?.render(<Sidebar />);
  });
  await clickRow('[data-workspace-id="alpha"]', { metaKey: true });
  await clickRow('[data-workspace-id="beta"]', { metaKey: true });

  expect(setActiveWorkspace).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[data-selected="true"]').length).toBe(2);
  expect(container.textContent).toContain("2 selected");
});

test("Escape clears the selection even when focus is outside the sidebar", async () => {
  await act(async () => {
    root?.render(<Sidebar />);
  });
  await clickRow('[data-workspace-id="alpha"]', { metaKey: true });
  expect(container.textContent).toContain("1 selected");

  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(container.textContent).not.toContain("selected");
});

test("the workspace menu acts on one row, and on the whole selection once it is in it", async () => {
  await act(async () => {
    root?.render(<Sidebar />);
  });

  const single = await openContextMenu('[data-workspace-id="alpha"]');
  expect(single.map((item) => item.id)).toEqual([
    "rename",
    "duplicate",
    "pin",
    "new-folder",
    "delete",
  ]);

  await clickRow('[data-workspace-id="alpha"]', { metaKey: true });
  await clickRow('[data-workspace-id="beta"]', { metaKey: true });
  const many = await openContextMenu('[data-workspace-id="alpha"]');
  expect(many.map((item) => item.label)).toEqual(["Duplicate 2 Workspaces"]);
  // Deleting both would empty the app, so the entry is withheld.
  expect(many.some((item) => item.id === "delete")).toBe(false);
});

test("duplicating a single workspace opens the copy; duplicating several does not", async () => {
  const duplicateWorkspace = vi.fn((id: string) => `${id}-copy`);
  const setActiveWorkspace = vi.fn();
  useWorkspaceStore.setState({ duplicateWorkspace, setActiveWorkspace });
  sidebarShellMocks.contextMenuShow.mockResolvedValue("duplicate");

  await act(async () => {
    root?.render(<Sidebar />);
  });

  await openContextMenu('[data-workspace-id="alpha"]');
  expect(duplicateWorkspace).toHaveBeenCalledWith("alpha");
  expect(setActiveWorkspace).toHaveBeenCalledWith("alpha-copy");

  duplicateWorkspace.mockClear();
  setActiveWorkspace.mockClear();
  await clickRow('[data-workspace-id="alpha"]', { metaKey: true });
  await clickRow('[data-workspace-id="beta"]', { metaKey: true });
  await openContextMenu('[data-workspace-id="alpha"]');

  expect(duplicateWorkspace.mock.calls.flat().toSorted()).toEqual(["alpha", "beta"]);
  // A batch has no single copy to land on, so the user stays put.
  expect(setActiveWorkspace).not.toHaveBeenCalled();
});

test("a folder holding workspaces offers dissolve and delete-with-contents separately", async () => {
  useWorkspaceStore.setState({
    sidebarTree: [
      {
        type: "folder",
        id: "folder-1",
        name: "Folder One",
        collapsed: false,
        children: [{ type: "workspace", workspaceId: "beta" }],
      },
      { type: "workspace", workspaceId: "alpha" },
    ],
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const items = await openContextMenu('[data-folder-id="folder-1"]');
  expect(items.map((item) => item.id)).toEqual([
    "rename",
    "pin",
    "add-workspace",
    "add-subfolder",
    "delete",
    "delete-contents",
  ]);
  expect(items.find((item) => item.id === "delete")?.label).toBe("Remove Folder Only");
  expect(items.find((item) => item.id === "delete-contents")?.label).toBe(
    "Delete Folder and 1 Workspace",
  );
});

test("an empty folder collapses the two delete entries back into one", async () => {
  useWorkspaceStore.setState({
    sidebarTree: [
      { type: "folder", id: "folder-1", name: "Folder One", collapsed: false, children: [] },
      { type: "workspace", workspaceId: "alpha" },
      { type: "workspace", workspaceId: "beta" },
    ],
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  const items = await openContextMenu('[data-folder-id="folder-1"]');
  expect(items.filter((item) => item.id.startsWith("delete")).map((item) => item.label)).toEqual([
    "Delete Folder",
  ]);
});

test("a folder joins the selection and the menu switches to mixed-item wording", async () => {
  useWorkspaceStore.setState({
    sidebarTree: [
      { type: "folder", id: "folder-1", name: "Folder One", collapsed: false, children: [] },
      { type: "workspace", workspaceId: "alpha" },
      { type: "workspace", workspaceId: "beta" },
    ],
  });

  await act(async () => {
    root?.render(<Sidebar />);
  });

  await clickRow('[data-folder-id="folder-1"]', { metaKey: true });
  await clickRow('[data-workspace-id="alpha"]', { metaKey: true });
  expect(container.textContent).toContain("2 selected");

  const items = await openContextMenu('[data-folder-id="folder-1"]');
  expect(items.map((item) => item.label)).toEqual(["Duplicate 1 Workspace", "Delete 2 Items"]);
});

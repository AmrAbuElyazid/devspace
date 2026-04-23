// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  BrowserContextMenuRequest,
  BrowserPermissionRequest,
  BrowserRuntimeState,
} from "../../shared/browser";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import { useBrowserBridge } from "./useBrowserBridge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const browserBridgeMocks = vi.hoisted(() => ({
  handleRuntimeStateChange: vi.fn(),
  setPendingPermissionRequest: vi.fn(),
  updatePaneConfig: vi.fn(),
  updatePaneTitle: vi.fn(),
  updateBrowserPaneZoom: vi.fn(),
  openBrowserInGroup: vi.fn(),
  syncWorkspaceFocusForPane: vi.fn(),
  stateChangeHandler: null as null | ((state: BrowserRuntimeState) => void),
  contextMenuRequestHandler: null as
    | null
    | ((request: BrowserContextMenuRequest) => void | Promise<void>),
  permissionRequestHandler: null as null | ((request: BrowserPermissionRequest) => void),
  focusedHandler: null as null | ((paneId: string) => void),
  onStateChange: vi.fn((callback: (state: BrowserRuntimeState) => void) => {
    browserBridgeMocks.stateChangeHandler = callback;
    return () => {};
  }),
  onFocused: vi.fn((callback: (paneId: string) => void) => {
    browserBridgeMocks.focusedHandler = callback;
    return () => {};
  }),
  onPermissionRequest: vi.fn((callback: (request: BrowserPermissionRequest) => void) => {
    browserBridgeMocks.permissionRequestHandler = callback;
    return () => {};
  }),
  onContextMenuRequest: vi.fn(
    (callback: (request: BrowserContextMenuRequest) => void | Promise<void>) => {
      browserBridgeMocks.contextMenuRequestHandler = callback;
      return () => {};
    },
  ),
  onOpenInNewTabRequest: vi.fn(() => () => {}),
  browserBack: vi.fn(),
  browserForward: vi.fn(),
  browserReload: vi.fn(),
  browserToggleDevTools: vi.fn(),
  shellOpenExternal: vi.fn(),
  contextMenuShow: vi.fn(),
  findWorkspaceIdForPane: vi.fn(() => "workspace-1"),
  workspaceState: {
    workspaces: [
      {
        id: "workspace-1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
      },
    ],
    paneGroups: {},
    panes: {},
  },
}));

vi.mock("../store/browser-store", () => ({
  useBrowserStore: (
    selector: (state: {
      handleRuntimeStateChange: typeof browserBridgeMocks.handleRuntimeStateChange;
      setPendingPermissionRequest: typeof browserBridgeMocks.setPendingPermissionRequest;
    }) => unknown,
  ) =>
    selector({
      handleRuntimeStateChange: browserBridgeMocks.handleRuntimeStateChange,
      setPendingPermissionRequest: browserBridgeMocks.setPendingPermissionRequest,
    }),
}));

vi.mock("../store/workspace-store", () => ({
  collectGroupIds: () => ["group-1"],
  useWorkspaceStore: Object.assign(
    (
      selector: (
        state: typeof browserBridgeMocks.workspaceState & {
          updatePaneConfig: typeof browserBridgeMocks.updatePaneConfig;
          updatePaneTitle: typeof browserBridgeMocks.updatePaneTitle;
          updateBrowserPaneZoom: typeof browserBridgeMocks.updateBrowserPaneZoom;
          openBrowserInGroup: typeof browserBridgeMocks.openBrowserInGroup;
        },
      ) => unknown,
    ) =>
      selector({
        ...browserBridgeMocks.workspaceState,
        updatePaneConfig: browserBridgeMocks.updatePaneConfig,
        updatePaneTitle: browserBridgeMocks.updatePaneTitle,
        updateBrowserPaneZoom: browserBridgeMocks.updateBrowserPaneZoom,
        openBrowserInGroup: browserBridgeMocks.openBrowserInGroup,
      }),
    {
      getState: () => ({
        ...browserBridgeMocks.workspaceState,
        updatePaneConfig: browserBridgeMocks.updatePaneConfig,
        updatePaneTitle: browserBridgeMocks.updatePaneTitle,
        updateBrowserPaneZoom: browserBridgeMocks.updateBrowserPaneZoom,
        openBrowserInGroup: browserBridgeMocks.openBrowserInGroup,
      }),
    },
  ),
}));

vi.mock("../lib/browser-pane-routing", () => ({
  findWorkspaceIdForPane: browserBridgeMocks.findWorkspaceIdForPane,
}));

vi.mock("../lib/editor-url", () => ({
  extractEditorFolderFromUrl: vi.fn(() => null),
}));

vi.mock("../lib/native-pane-focus", () => ({
  syncWorkspaceFocusForPane: browserBridgeMocks.syncWorkspaceFocusForPane,
}));

function HookHarness() {
  useBrowserBridge();
  return null;
}

let container: HTMLDivElement;
let root: Root | null;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  browserBridgeMocks.handleRuntimeStateChange.mockReset();
  browserBridgeMocks.setPendingPermissionRequest.mockReset();
  browserBridgeMocks.updatePaneConfig.mockReset();
  browserBridgeMocks.updatePaneTitle.mockReset();
  browserBridgeMocks.updateBrowserPaneZoom.mockReset();
  browserBridgeMocks.openBrowserInGroup.mockReset();
  browserBridgeMocks.syncWorkspaceFocusForPane.mockReset();
  browserBridgeMocks.stateChangeHandler = null;
  browserBridgeMocks.contextMenuRequestHandler = null;
  browserBridgeMocks.permissionRequestHandler = null;
  browserBridgeMocks.focusedHandler = null;
  browserBridgeMocks.onStateChange.mockClear();
  browserBridgeMocks.onFocused.mockClear();
  browserBridgeMocks.onPermissionRequest.mockClear();
  browserBridgeMocks.onContextMenuRequest.mockClear();
  browserBridgeMocks.onOpenInNewTabRequest.mockClear();
  browserBridgeMocks.browserBack.mockReset();
  browserBridgeMocks.browserForward.mockReset();
  browserBridgeMocks.browserReload.mockReset();
  browserBridgeMocks.browserToggleDevTools.mockReset();
  browserBridgeMocks.shellOpenExternal.mockReset();
  browserBridgeMocks.contextMenuShow.mockReset();
  browserBridgeMocks.findWorkspaceIdForPane.mockReset();
  browserBridgeMocks.findWorkspaceIdForPane.mockReturnValue("workspace-1");
  browserBridgeMocks.workspaceState = {
    workspaces: [
      {
        id: "workspace-1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
      },
    ],
    paneGroups: {},
    panes: {},
  };

  installMockWindowApi({
    browser: {
      onStateChange: browserBridgeMocks.onStateChange,
      onFocused: browserBridgeMocks.onFocused,
      onPermissionRequest: browserBridgeMocks.onPermissionRequest,
      onContextMenuRequest: browserBridgeMocks.onContextMenuRequest,
      onOpenInNewTabRequest: browserBridgeMocks.onOpenInNewTabRequest,
      back: browserBridgeMocks.browserBack,
      forward: browserBridgeMocks.browserForward,
      reload: browserBridgeMocks.browserReload,
      toggleDevTools: browserBridgeMocks.browserToggleDevTools,
      navigate: vi.fn(),
    },
    contextMenu: {
      show: browserBridgeMocks.contextMenuShow,
    },
    shell: {
      openExternal: browserBridgeMocks.shellOpenExternal,
    },
  });

  await act(async () => {
    root?.render(<HookHarness />);
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

test("opens link context-menu targets in a new tab for the focused group", async () => {
  browserBridgeMocks.contextMenuShow.mockResolvedValueOnce("link-open-new-tab");

  expect(browserBridgeMocks.contextMenuRequestHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.contextMenuRequestHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a context menu handler");
  }

  await act(async () => {
    await handler({
      paneId: "pane-1",
      position: { x: 24, y: 48 },
      target: "link",
      pageUrl: "https://example.com/",
      linkUrl: "https://devspace.dev/docs",
      selectionText: null,
      canGoBack: true,
      canGoForward: false,
    });
  });

  expect(browserBridgeMocks.contextMenuShow).toHaveBeenCalledWith(
    [
      { id: "link-open-new-tab", label: "Open in New Tab" },
      { id: "link-open-external", label: "Open in External Browser" },
      { id: "link-copy", label: "Copy Link" },
    ],
    { x: 24, y: 48 },
  );
  expect(browserBridgeMocks.openBrowserInGroup).toHaveBeenCalledWith(
    "workspace-1",
    "group-1",
    "https://devspace.dev/docs",
  );
});

test("opens the current page in the external browser from the page context menu", async () => {
  browserBridgeMocks.contextMenuShow.mockResolvedValueOnce("page-open-external");

  expect(browserBridgeMocks.contextMenuRequestHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.contextMenuRequestHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a context menu handler");
  }

  await act(async () => {
    await handler({
      paneId: "pane-1",
      position: { x: 24, y: 48 },
      target: "page",
      pageUrl: "https://example.com/",
      linkUrl: null,
      selectionText: null,
      canGoBack: true,
      canGoForward: false,
    });
  });

  expect(browserBridgeMocks.contextMenuShow).toHaveBeenCalledWith(
    [
      { id: "page-back", label: "Back" },
      { id: "page-forward", label: "Forward" },
      { id: "page-reload", label: "Reload" },
      { id: "page-open-external", label: "Open in External Browser" },
      { id: "page-inspect", label: "Inspect" },
    ],
    { x: 24, y: 48 },
  );
  expect(browserBridgeMocks.shellOpenExternal).toHaveBeenCalledWith("https://example.com/");
});

test("syncs workspace focus when a webcontents-based pane gains focus", async () => {
  expect(browserBridgeMocks.focusedHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.focusedHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a focus handler");
  }

  await act(async () => {
    handler("pane-7");
  });

  expect(browserBridgeMocks.syncWorkspaceFocusForPane).toHaveBeenCalledWith("pane-7");
});

test("queues permission requests without denying an earlier pane", async () => {
  expect(browserBridgeMocks.permissionRequestHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.permissionRequestHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a permission handler");
  }

  await act(async () => {
    handler({
      paneId: "pane-2",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    });
  });

  expect(browserBridgeMocks.setPendingPermissionRequest).toHaveBeenCalledWith({
    paneId: "pane-2",
    origin: "https://camera.example",
    permissionType: "camera",
    requestToken: "token-1",
  });
});

test("syncs managed editor pane titles from VS Code runtime state", async () => {
  browserBridgeMocks.workspaceState.panes = {
    "pane-1": {
      id: "pane-1",
      type: "editor",
      title: "VC: project",
      config: { folderPath: "/tmp/project" },
    },
  };

  expect(browserBridgeMocks.stateChangeHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.stateChangeHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a state change handler");
  }

  await act(async () => {
    handler({
      paneId: "pane-1",
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=secret&folder=%2Ftmp%2Fproject",
      title: "● README.md - project - Visual Studio Code",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: false,
      securityLabel: null,
      currentZoom: 1,
      find: null,
      failure: null,
    });
  });

  expect(browserBridgeMocks.updatePaneTitle).toHaveBeenCalledWith(
    "pane-1",
    "VC: ● README.md - project",
  );
});

test("does not overwrite custom editor pane titles", async () => {
  browserBridgeMocks.workspaceState.panes = {
    "pane-1": {
      id: "pane-1",
      type: "editor",
      title: "Pinned docs",
      config: { folderPath: "/tmp/project" },
    },
  };

  expect(browserBridgeMocks.stateChangeHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.stateChangeHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a state change handler");
  }

  await act(async () => {
    handler({
      paneId: "pane-1",
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=secret&folder=%2Ftmp%2Fproject",
      title: "● README.md - project - Visual Studio Code",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: false,
      securityLabel: null,
      currentZoom: 1,
      find: null,
      failure: null,
    });
  });

  expect(browserBridgeMocks.updatePaneTitle).not.toHaveBeenCalled();
});

test("keeps the default folder title when VS Code reports only its product name", async () => {
  browserBridgeMocks.workspaceState.panes = {
    "pane-1": {
      id: "pane-1",
      type: "editor",
      title: "VC: project",
      config: { folderPath: "/tmp/project" },
    },
  };

  expect(browserBridgeMocks.stateChangeHandler).toBeTypeOf("function");
  const handler = browserBridgeMocks.stateChangeHandler;
  if (!handler) {
    throw new Error("expected useBrowserBridge to register a state change handler");
  }

  await act(async () => {
    handler({
      paneId: "pane-1",
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=secret&folder=%2Ftmp%2Fproject",
      title: "Visual Studio Code",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: false,
      securityLabel: null,
      currentZoom: 1,
      find: null,
      failure: null,
    });
  });

  expect(browserBridgeMocks.updatePaneTitle).not.toHaveBeenCalled();
});

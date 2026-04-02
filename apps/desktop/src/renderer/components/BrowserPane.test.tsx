// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BrowserContextMenuRequest, BrowserRuntimeState } from "../../shared/browser";
import BrowserPane from "./BrowserPane";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const browserPaneMocks = vi.hoisted(() => ({
  useNativeView: vi.fn(),
  openBrowserInGroup: vi.fn(),
  clearPendingPermissionRequest: vi.fn(),
  closeFindBar: vi.fn(),
  upsertRuntimeState: vi.fn(),
  browserCreate: vi.fn(() => Promise.resolve()),
  browserGetRuntimeState: vi.fn<(paneId: string) => Promise<BrowserRuntimeState | undefined>>(() =>
    Promise.resolve(undefined),
  ),
  browserSetZoom: vi.fn(),
  browserNavigate: vi.fn(),
  browserStop: vi.fn(),
  browserReload: vi.fn(),
  browserResolvePermission: vi.fn(),
  browserStopFindInPage: vi.fn(),
  browserBack: vi.fn(),
  browserForward: vi.fn(),
  browserToggleDevTools: vi.fn(),
  onContextMenuRequest: vi.fn<
    (callback: (request: BrowserContextMenuRequest) => void) => () => void
  >(() => () => {}),
  contextMenuRequestHandler: null as null | ((request: BrowserContextMenuRequest) => void),
  createdPanes: new Set<string>(),
  workspaceState: {
    workspaces: [{ id: "workspace-1", focusedGroupId: "group-1" }],
  },
  browserStoreState: {
    runtimeByPaneId: {} as Record<string, unknown>,
    pendingPermissionRequest: null as unknown,
    findBarOpenByPaneId: {} as Record<string, boolean>,
    addressBarFocusTokenByPaneId: {} as Record<string, number>,
    findBarFocusTokenByPaneId: {} as Record<string, number>,
  },
}));

vi.mock("../hooks/useNativeView", () => ({
  useNativeView: (args: unknown) => browserPaneMocks.useNativeView(args),
}));

vi.mock("../store/browser-store", () => ({
  useBrowserStore: (
    selector: (
      state: typeof browserPaneMocks.browserStoreState & {
        clearPendingPermissionRequest: typeof browserPaneMocks.clearPendingPermissionRequest;
        closeFindBar: typeof browserPaneMocks.closeFindBar;
        upsertRuntimeState: typeof browserPaneMocks.upsertRuntimeState;
      },
    ) => unknown,
  ) =>
    selector({
      ...browserPaneMocks.browserStoreState,
      clearPendingPermissionRequest: browserPaneMocks.clearPendingPermissionRequest,
      closeFindBar: browserPaneMocks.closeFindBar,
      upsertRuntimeState: browserPaneMocks.upsertRuntimeState,
    }),
}));

type WorkspaceStoreShape = {
  openBrowserInGroup: typeof browserPaneMocks.openBrowserInGroup;
  workspaces: { id: string; focusedGroupId: string }[];
};

vi.mock("../store/workspace-store", () => ({
  useWorkspaceStore: Object.assign(
    (selector: (state: WorkspaceStoreShape) => unknown) =>
      selector({
        openBrowserInGroup: browserPaneMocks.openBrowserInGroup,
        workspaces: browserPaneMocks.workspaceState.workspaces,
      }),
    {
      getState: () => ({
        openBrowserInGroup: browserPaneMocks.openBrowserInGroup,
        workspaces: browserPaneMocks.workspaceState.workspaces,
      }),
    },
  ),
}));

vi.mock("../lib/browser-pane-session", () => ({
  hasCreatedBrowserPane: (paneId: string) => browserPaneMocks.createdPanes.has(paneId),
  markBrowserPaneCreated: (paneId: string) => {
    browserPaneMocks.createdPanes.add(paneId);
  },
  markBrowserPaneDestroyed: (paneId: string) => {
    browserPaneMocks.createdPanes.delete(paneId);
  },
}));

vi.mock("./ui/button", () => ({
  Button: ({
    children,
    onClick,
    onMouseDown,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} onMouseDown={onMouseDown} type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("./ui/tooltip", () => ({
  Tooltip: ({ children }: { children: unknown }) => children,
}));

vi.mock("./browser/BrowserFindBar", () => ({
  default: () => <div data-testid="browser-find-bar" />,
}));

vi.mock("./browser/BrowserPaneStatusSurface", () => ({
  default: () => <div data-testid="browser-status-surface" />,
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  browserPaneMocks.useNativeView.mockReset();
  browserPaneMocks.useNativeView.mockReturnValue({ isVisible: true });
  browserPaneMocks.openBrowserInGroup.mockReset();
  browserPaneMocks.clearPendingPermissionRequest.mockReset();
  browserPaneMocks.closeFindBar.mockReset();
  browserPaneMocks.upsertRuntimeState.mockReset();
  browserPaneMocks.browserCreate.mockReset();
  browserPaneMocks.browserCreate.mockReturnValue(Promise.resolve());
  browserPaneMocks.browserGetRuntimeState.mockReset();
  browserPaneMocks.browserGetRuntimeState.mockReturnValue(Promise.resolve(undefined));
  browserPaneMocks.browserSetZoom.mockReset();
  browserPaneMocks.browserNavigate.mockReset();
  browserPaneMocks.browserStop.mockReset();
  browserPaneMocks.browserReload.mockReset();
  browserPaneMocks.browserResolvePermission.mockReset();
  browserPaneMocks.browserStopFindInPage.mockReset();
  browserPaneMocks.browserBack.mockReset();
  browserPaneMocks.browserForward.mockReset();
  browserPaneMocks.browserToggleDevTools.mockReset();
  browserPaneMocks.onContextMenuRequest.mockReset();
  browserPaneMocks.contextMenuRequestHandler = null;
  browserPaneMocks.onContextMenuRequest.mockImplementation(
    (callback: (request: BrowserContextMenuRequest) => void) => {
      browserPaneMocks.contextMenuRequestHandler = callback;
      return () => {};
    },
  );
  browserPaneMocks.createdPanes.clear();

  browserPaneMocks.browserStoreState = {
    runtimeByPaneId: {
      "pane-1": {
        paneId: "pane-1",
        url: "https://example.com/",
        title: "Example",
        faviconUrl: null,
        isLoading: false,
        canGoBack: true,
        canGoForward: false,
        isSecure: true,
        securityLabel: "Secure connection",
        currentZoom: 1,
        find: null,
        failure: null,
      },
    },
    pendingPermissionRequest: null,
    findBarOpenByPaneId: {},
    addressBarFocusTokenByPaneId: {},
    findBarFocusTokenByPaneId: {},
  };

  window.api = {
    browser: {
      create: browserPaneMocks.browserCreate,
      getRuntimeState: browserPaneMocks.browserGetRuntimeState,
      setZoom: browserPaneMocks.browserSetZoom,
      navigate: browserPaneMocks.browserNavigate,
      stop: browserPaneMocks.browserStop,
      reload: browserPaneMocks.browserReload,
      resolvePermission: browserPaneMocks.browserResolvePermission,
      stopFindInPage: browserPaneMocks.browserStopFindInPage,
      back: browserPaneMocks.browserBack,
      forward: browserPaneMocks.browserForward,
      toggleDevTools: browserPaneMocks.browserToggleDevTools,
      onContextMenuRequest: browserPaneMocks.onContextMenuRequest,
    },
    contextMenu: {
      show: vi.fn(),
    },
  } as unknown as typeof window.api;
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

test("creates the browser pane and renders the current security label", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).toHaveBeenCalledWith("pane-1", "https://example.com/");
  expect(browserPaneMocks.browserGetRuntimeState).toHaveBeenCalledWith("pane-1");
  expect(container.textContent).toContain("Secure connection");
});

test("hydrates runtime state for an already-created browser pane", async () => {
  browserPaneMocks.createdPanes.add("pane-1");
  browserPaneMocks.browserStoreState = {
    ...browserPaneMocks.browserStoreState,
    runtimeByPaneId: {},
  };
  browserPaneMocks.browserGetRuntimeState.mockResolvedValueOnce({
    paneId: "pane-1",
    url: "https://restored.example/",
    title: "Restored",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Restored security state",
    currentZoom: 1,
    find: null,
    failure: null,
  });

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).not.toHaveBeenCalled();
  expect(browserPaneMocks.browserGetRuntimeState).toHaveBeenCalledWith("pane-1");
  expect(browserPaneMocks.upsertRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({
      paneId: "pane-1",
      url: "https://restored.example/",
    }),
  );
});

test("dismissing or allowing a permission request clears local state and resolves the request", async () => {
  browserPaneMocks.browserStoreState = {
    ...browserPaneMocks.browserStoreState,
    pendingPermissionRequest: {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
  };

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
      />,
    );
  });

  expect(container.textContent).toContain("camera.example");

  const dismissButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Dismiss",
  );
  const allowOnceButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Allow once",
  );

  expect(dismissButton).toBeTruthy();
  expect(allowOnceButton).toBeTruthy();

  await act(async () => {
    dismissButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(browserPaneMocks.clearPendingPermissionRequest).toHaveBeenCalledTimes(1);
  expect(browserPaneMocks.browserResolvePermission).toHaveBeenCalledWith("token-1", "deny");

  await act(async () => {
    allowOnceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(browserPaneMocks.clearPendingPermissionRequest).toHaveBeenCalledTimes(2);
  expect(browserPaneMocks.browserResolvePermission).toHaveBeenCalledWith("token-1", "allow-once");
});

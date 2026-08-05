// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BrowserContextMenuRequest, BrowserRuntimeState } from "../../shared/browser";
import BrowserPane from "./BrowserPane";
import { installMockWindowApi } from "../test-utils/mock-window-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const browserPaneMocks = vi.hoisted(() => ({
  useNativeView: vi.fn(),
  openBrowserInGroup: vi.fn(),
  clearPendingPermissionRequest: vi.fn(),
  closeFindBar: vi.fn(),
  upsertRuntimeState: vi.fn(),
  browserCreate: vi.fn(() => Promise.resolve()),
  browserDestroy: vi.fn(async () => {}),
  browserGetRuntimeState: vi.fn<(paneId: string) => Promise<BrowserRuntimeState | undefined>>(() =>
    Promise.resolve(undefined),
  ),
  browserSetZoom: vi.fn(),
  browserNavigate: vi.fn(),
  browserStop: vi.fn(),
  browserReload: vi.fn(),
  browserResolvePermission: vi.fn(),
  browserStopFindInPage: vi.fn(),
  browserSetFocus: vi.fn(),
  browserBack: vi.fn(),
  browserForward: vi.fn(),
  browserToggleDevTools: vi.fn(),
  shellOpenExternal: vi.fn(),
  onContextMenuRequest: vi.fn<
    (callback: (request: BrowserContextMenuRequest) => void) => () => void
  >(() => () => {}),
  contextMenuRequestHandler: null as null | ((request: BrowserContextMenuRequest) => void),
  createdPanes: new Set<string>(),
  paneSnapshots: new Map<
    string,
    { phase: "pending" | "ready" | "error"; generation: number; error: string | null }
  >(),
  paneListeners: new Map<string, Set<() => void>>(),
  missingPaneSnapshot: { phase: "missing" as const, generation: 0, error: null },
  readyPaneSnapshot: { phase: "ready" as const, generation: 1, error: null },
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
  getBrowserPaneSessionSnapshot: (paneId: string) =>
    browserPaneMocks.paneSnapshots.get(paneId) ??
    (browserPaneMocks.createdPanes.has(paneId)
      ? browserPaneMocks.readyPaneSnapshot
      : browserPaneMocks.missingPaneSnapshot),
  subscribeBrowserPane: (paneId: string, listener: () => void) => {
    const listeners = browserPaneMocks.paneListeners.get(paneId) ?? new Set<() => void>();
    listeners.add(listener);
    browserPaneMocks.paneListeners.set(paneId, listeners);
    return () => listeners.delete(listener);
  },
  hasCreatedBrowserPane: (paneId: string) => browserPaneMocks.createdPanes.has(paneId),
  markBrowserPaneCreated: (paneId: string) => {
    const generation = (browserPaneMocks.paneSnapshots.get(paneId)?.generation ?? 0) + 1;
    browserPaneMocks.createdPanes.add(paneId);
    browserPaneMocks.paneSnapshots.set(paneId, {
      phase: "pending",
      generation,
      error: null,
    });
    for (const listener of browserPaneMocks.paneListeners.get(paneId) ?? []) listener();
    return generation;
  },
  markBrowserPaneReady: (paneId: string, _destroy: unknown, generation: number) => {
    if (browserPaneMocks.paneSnapshots.get(paneId)?.generation !== generation) return false;
    browserPaneMocks.paneSnapshots.set(paneId, {
      phase: "ready",
      generation,
      error: null,
    });
    for (const listener of browserPaneMocks.paneListeners.get(paneId) ?? []) listener();
    return true;
  },
  markBrowserPaneFailed: (paneId: string, generation: number, error: string) => {
    if (browserPaneMocks.paneSnapshots.get(paneId)?.generation !== generation) return false;
    browserPaneMocks.createdPanes.delete(paneId);
    browserPaneMocks.paneSnapshots.set(paneId, { phase: "error", generation, error });
    for (const listener of browserPaneMocks.paneListeners.get(paneId) ?? []) listener();
    return true;
  },
  markBrowserPaneActive: () => {},
  markBrowserPaneInactive: () => {},
  markBrowserPaneDestroyed: (paneId: string) => {
    browserPaneMocks.createdPanes.delete(paneId);
    browserPaneMocks.paneSnapshots.delete(paneId);
    for (const listener of browserPaneMocks.paneListeners.get(paneId) ?? []) listener();
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

vi.mock("./ui/hint-tooltip", () => ({
  HintTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  browserPaneMocks.browserDestroy.mockReset();
  browserPaneMocks.browserGetRuntimeState.mockReset();
  browserPaneMocks.browserGetRuntimeState.mockReturnValue(Promise.resolve(undefined));
  browserPaneMocks.browserSetZoom.mockReset();
  browserPaneMocks.browserNavigate.mockReset();
  browserPaneMocks.browserStop.mockReset();
  browserPaneMocks.browserReload.mockReset();
  browserPaneMocks.browserResolvePermission.mockReset();
  browserPaneMocks.browserStopFindInPage.mockReset();
  browserPaneMocks.browserSetFocus.mockReset();
  browserPaneMocks.browserBack.mockReset();
  browserPaneMocks.browserForward.mockReset();
  browserPaneMocks.browserToggleDevTools.mockReset();
  browserPaneMocks.shellOpenExternal.mockReset();
  browserPaneMocks.onContextMenuRequest.mockReset();
  browserPaneMocks.contextMenuRequestHandler = null;
  browserPaneMocks.onContextMenuRequest.mockImplementation(
    (callback: (request: BrowserContextMenuRequest) => void) => {
      browserPaneMocks.contextMenuRequestHandler = callback;
      return () => {};
    },
  );
  browserPaneMocks.createdPanes.clear();
  browserPaneMocks.paneSnapshots.clear();
  browserPaneMocks.paneListeners.clear();

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

  installMockWindowApi({
    browser: {
      create: browserPaneMocks.browserCreate,
      destroy: browserPaneMocks.browserDestroy,
      getRuntimeState: browserPaneMocks.browserGetRuntimeState,
      setZoom: browserPaneMocks.browserSetZoom,
      navigate: browserPaneMocks.browserNavigate,
      stop: browserPaneMocks.browserStop,
      reload: browserPaneMocks.browserReload,
      resolvePermission: browserPaneMocks.browserResolvePermission,
      stopFindInPage: browserPaneMocks.browserStopFindInPage,
      setFocus: browserPaneMocks.browserSetFocus,
      back: browserPaneMocks.browserBack,
      forward: browserPaneMocks.browserForward,
      toggleDevTools: browserPaneMocks.browserToggleDevTools,
      onContextMenuRequest: browserPaneMocks.onContextMenuRequest,
    },
    window: {
      focusContent: vi.fn(),
    },
    shell: {
      openExternal: browserPaneMocks.shellOpenExternal,
    },
    contextMenu: {
      show: vi.fn(),
    },
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

test("creates the browser pane and renders the current security label", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).toHaveBeenCalledWith("pane-1", "https://example.com/");
  expect(browserPaneMocks.browserGetRuntimeState).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Secure connection"]')).toBeTruthy();
  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
});

test("reuses an existing browser pane across unmount and remount", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).toHaveBeenCalledTimes(1);
  expect(browserPaneMocks.createdPanes.has("pane-1")).toBe(true);

  await act(async () => {
    root?.unmount();
    root = null;
  });

  expect(browserPaneMocks.browserDestroy).not.toHaveBeenCalled();

  root = createRoot(container);

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).toHaveBeenCalledTimes(1);
  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledTimes(2);
  expect(browserPaneMocks.createdPanes.has("pane-1")).toBe(true);
});

test("surfaces a pending browser creation failure after remount", async () => {
  let rejectCreate: ((error: Error) => void) | null = null;
  browserPaneMocks.browserCreate.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectCreate = reject;
    }),
  );

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });
  expect(browserPaneMocks.browserCreate).toHaveBeenCalledTimes(1);

  await act(async () => {
    root?.unmount();
    root = null;
  });
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserCreate).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectCreate?.(new Error("web contents failed"));
    await Promise.resolve();
  });

  expect(container.querySelector('[data-testid="browser-status-surface"]')).toBeTruthy();
});

test("focuses the native browser view when it becomes visible", async () => {
  let nativeVisible = false;
  browserPaneMocks.useNativeView.mockImplementation(() => ({ isVisible: nativeVisible }));

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  browserPaneMocks.browserSetFocus.mockClear();
  nativeVisible = true;

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
});

test("focuses the native browser view when an already-visible pane becomes focused", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={false}
      />,
    );
  });

  expect(browserPaneMocks.browserSetFocus).not.toHaveBeenCalled();

  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledTimes(1);
  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
});

/**
 * Drives one dev-server restart the way the main process reports it: the load
 * fails (the server went away mid-edit), which hides the native view behind
 * the failure card, and the page then reloads itself when the server is back,
 * which clears the failure and puts the view on screen again.
 */
async function runDevServerRestartCycle(
  render: () => void,
  setFailure: (failure: { kind: "navigation"; detail: string; url: string } | null) => void,
): Promise<void> {
  // did-fail-load: ERR_CONNECTION_REFUSED while the server is restarting.
  setFailure({
    kind: "navigation",
    detail: "ERR_CONNECTION_REFUSED",
    url: "https://example.com/",
  });
  await act(async () => {
    render();
  });

  // did-start-loading: the page reloads once the server answers again.
  setFailure(null);
  await act(async () => {
    render();
  });
}

test("a dev server restart asks for focus reactively, never as a user gesture", async () => {
  // The reload churn an agent's edits produce: the pane hides on the failed
  // load and comes back on the retry, entirely on its own. Focusing a web
  // contents activates the app and raises its window on macOS, so this focus
  // has to be marked reactive — main then refuses it while the user is in
  // another app, which is the "Devspace keeps stealing focus" report.
  let nativeVisible = true;
  browserPaneMocks.useNativeView.mockImplementation((args: unknown) => {
    const enabled = (args as { enabled?: boolean }).enabled ?? true;
    return { isVisible: nativeVisible && enabled };
  });

  const runtime = browserPaneMocks.browserStoreState.runtimeByPaneId["pane-1"] as {
    failure: unknown;
  };
  const render = (): void => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  };

  await act(async () => {
    render();
  });
  browserPaneMocks.browserSetFocus.mockClear();

  await runDevServerRestartCycle(render, (failure) => {
    runtime.failure = failure;
  });

  expect(browserPaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
  nativeVisible = false;
});

test("does not focus the native browser view when its group is not focused", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={false}
      />,
    );
  });

  expect(browserPaneMocks.browserSetFocus).not.toHaveBeenCalled();
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
        isFocused={true}
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
        isFocused={true}
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

test("the toolbar exposes navigation, the address bar, and an overflow menu", async () => {
  await act(async () => {
    root?.render(
      <BrowserPane
        paneId="pane-1"
        workspaceId="workspace-1"
        config={{ url: "https://example.com/" }}
        isFocused={true}
      />,
    );
  });

  // Guards the toolbar's shape. Secondary actions (zoom, find, open external,
  // devtools) live behind the overflow now; base-ui's menu does not open under
  // jsdom's synthetic events, so its contents are covered by the e2e drive
  // rather than asserted here.
  for (const label of ["Back", "Forward", "Reload", "Toggle device mode", "Browser menu"]) {
    expect(container.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
  }
  expect(container.querySelector('input[aria-label="Address and search bar"]')).toBeTruthy();

  // Zoom is a default 100%, so the inline readout stays out of the way.
  expect(container.textContent).not.toContain("100%");
});

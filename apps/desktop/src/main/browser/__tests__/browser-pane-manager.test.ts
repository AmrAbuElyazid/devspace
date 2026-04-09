import { test, expect, vi } from "vitest";
import { BrowserPaneManager } from "../browser-pane-manager";

function makeManager(): BrowserPaneManager {
  return new BrowserPaneManager({
    createView: () => ({ webContents: {} }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });
}

test("tracks pane lifecycle bookkeeping across create show hide and destroy", () => {
  const childViews: unknown[] = [];
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  let destroyed = false;
  const view = {
    webContents: {
      close: () => {
        destroyed = true;
      },
    },
  };

  const manager = new BrowserPaneManager({
    createView: () => view as never,
    addChildView: (nextView) => {
      childViews.push(nextView);
    },
    removeChildView: (nextView) => {
      const index = childViews.indexOf(nextView);
      if (index >= 0) {
        childViews.splice(index, 1);
      }
    },
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");

  expect(manager.getRuntimeState("pane-1")?.paneId).toBe("pane-1");
  expect(manager.getRuntimeState("pane-1")?.url).toBe("https://example.com");
  expect(childViews).toEqual([]);
  expect(rendererMessages.length).toBe(1);
  expect(rendererMessages[0]?.channel).toBe("browser:stateChanged");

  manager.showPane("pane-1");

  expect(childViews).toEqual([view]);

  manager.hidePane("pane-1");

  expect(childViews).toEqual([]);

  manager.showPane("pane-1");
  manager.destroyPane("pane-1");

  expect(childViews).toEqual([]);
  expect(destroyed).toBe(true);
  expect(manager.getRuntimeState("pane-1")).toBe(undefined);
});

test("createPane uses explicit hardened webPreferences for browser views", () => {
  const session = { id: "session-1" } as never;
  let receivedOptions: Record<string, unknown> | undefined;

  const manager = new BrowserPaneManager({
    createView: (options) => {
      receivedOptions = options as unknown as Record<string, unknown>;
      return {
        webContents: {
          loadURL: () => Promise.resolve(),
        },
      } as never;
    },
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    getSession: () => session,
  });

  manager.createPane("pane-1", "https://example.com");

  expect(receivedOptions).toEqual({
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      safeDialogs: true,
      sandbox: true,
      session,
      webSecurity: true,
      webviewTag: false,
    },
  });
});

test("hidePane preserves runtime state and visibility bookkeeping", () => {
  const manager = makeManager();

  manager.createPane("pane-1", "https://example.com");
  manager.showPane("pane-1");
  manager.hidePane("pane-1");

  expect(manager.getRuntimeState("pane-1")?.url).toBe("https://example.com");
  expect(manager.isPaneVisible("pane-1")).toBe(false);
});

test("runtime updates capture title, favicon, and loading state", () => {
  const manager = makeManager();
  manager.createPane("pane-1", "https://example.com");
  manager.applyRuntimePatch("pane-1", {
    title: "Example",
    faviconUrl: "https://example.com/favicon.ico",
    isLoading: true,
  });

  expect(manager.getRuntimeState("pane-1")?.title).toBe("Example");
  expect(manager.getRuntimeState("pane-1")?.faviconUrl).toBe("https://example.com/favicon.ico");
  expect(manager.getRuntimeState("pane-1")?.isLoading).toBe(true);
});

test("webcontents focus events are forwarded to the renderer", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");
  rendererMessages.length = 0;

  listeners.get("focus")?.();

  expect(rendererMessages).toEqual([{ channel: "browser:focused", payload: "pane-1" }]);
});

test("before-input-event routes app-owned shortcuts and modifier hints from webcontents", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts: () => {},
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [
      {
        action: "new-tab",
        channel: "app:new-tab",
        shortcut: { key: "t", command: true, shift: false, option: false, control: false },
      },
    ],
  });

  manager.createPane("pane-1", "https://example.com");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "t", meta: true, control: false, shift: false, alt: false },
  );
  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "Meta", meta: true, control: false, shift: false, alt: false },
  );
  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyUp", key: "Meta", meta: false, control: false, shift: false, alt: false },
  );

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(rendererMessages).toContainEqual({
    channel: "window:nativeModifierChanged",
    payload: "command",
  });
  expect(rendererMessages).toContainEqual({ channel: "app:new-tab", payload: undefined });
  expect(rendererMessages.at(-1)).toEqual({
    channel: "window:nativeModifierChanged",
    payload: null,
  });
});

test("browser-only shortcuts are not intercepted for editor webcontents", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const setIgnoreMenuShortcuts = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts,
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [
      {
        action: "browser-find",
        channel: "app:browser-find",
        shortcut: { key: "f", command: true, shift: false, option: false, control: false },
      },
    ],
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "f", meta: true, control: false, shift: false, alt: false },
  );

  expect(preventDefault).not.toHaveBeenCalled();
  expect(rendererMessages).toEqual([
    { channel: "window:nativeModifierChanged", payload: "command" },
  ]);
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
});

test("editor panes still intercept the explicit close-window shortcut", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const setIgnoreMenuShortcuts = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts,
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [
      {
        action: "close-window",
        channel: "app:close-window",
        shortcut: { key: "w", command: true, shift: false, option: false, control: true },
      },
    ],
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "w", meta: true, control: true, shift: false, alt: false },
  );

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
  expect(rendererMessages).toContainEqual({ channel: "app:close-window", payload: undefined });
});

test("shifted symbol shortcuts still match their base shortcut keys", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts: () => {},
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [
      {
        action: "prev-tab",
        channel: "app:prev-tab",
        shortcut: { key: "[", command: true, shift: true, option: false, control: false },
      },
    ],
  });

  manager.createPane("pane-1", "https://example.com");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "{", meta: true, control: false, shift: true, alt: false },
  );

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(rendererMessages).toContainEqual({ channel: "app:prev-tab", payload: undefined });
});

test("navigate keeps persisted runtime url unchanged until navigation commits", () => {
  const loadCalls: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: (url: string) => {
            loadCalls.push(url);
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.navigate("pane-1", "https://next.example.com");

  expect(loadCalls).toEqual(["https://example.com", "https://next.example.com"]);
  expect(manager.getRuntimeState("pane-1")?.url).toBe("https://example.com");
});

test("failed navigation does not replace the committed runtime url", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-fail-load")?.({}, -105, "NAME_NOT_RESOLVED", "https://bad.example", true);

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.url).toBe("https://example.com");
  expect(runtimeState?.title).toBe("NAME_NOT_RESOLVED");
  expect(runtimeState?.failure).toEqual({
    kind: "navigation",
    detail: "NAME_NOT_RESOLVED",
    url: "https://bad.example",
  });
});

test("did-stop-loading does not clear an existing navigation failure state", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-fail-load")?.({}, -105, "NAME_NOT_RESOLVED", "https://bad.example", true);
  listeners.get("did-stop-loading")?.();

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.failure).toEqual({
    kind: "navigation",
    detail: "NAME_NOT_RESOLVED",
    url: "https://bad.example",
  });
});

test("aborted main-frame loads do not create a final navigation failure state", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-fail-load")?.({}, -3, "ERR_ABORTED", "https://example.com/next", true);

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.failure).toBe(null);
  expect(runtimeState?.url).toBe("https://example.com");
});

test("explicit certificate error security state is preserved on runtime patch", () => {
  const manager = makeManager();

  manager.createPane("pane-1", "https://example.com");
  manager.applyRuntimePatch("pane-1", {
    url: "https://expired.badssl.com/",
    isSecure: false,
    securityLabel: "Certificate error",
  });

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.isSecure).toBe(false);
  expect(runtimeState?.securityLabel).toBe("Certificate error");
});

test("reportFailure preserves the last committed url for certificate-style navigation failures", () => {
  const manager = makeManager();

  manager.createPane("pane-1", "https://example.com");
  manager.reportFailure(
    "pane-1",
    {
      kind: "navigation",
      detail: "Certificate error",
      url: "https://expired.badssl.com/",
    },
    {
      title: "Certificate error",
      isSecure: false,
      securityLabel: "Certificate error",
    },
  );

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.url).toBe("https://example.com");
  expect(runtimeState?.title).toBe("Certificate error");
  expect(runtimeState?.failure).toEqual({
    kind: "navigation",
    detail: "Certificate error",
    url: "https://expired.badssl.com/",
  });
});

test("find result updates active and total matches", () => {
  const manager = makeManager();

  manager.createPane("pane-1", "https://example.com");
  manager.applyFindResult("pane-1", { query: "hello", activeMatch: 2, totalMatches: 5 });

  expect(manager.getRuntimeState("pane-1")?.find).toEqual({
    query: "hello",
    activeMatch: 2,
    totalMatches: 5,
  });
});

test("found-in-page event updates stored match counts", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.findInPage("pane-1", "hello");
  listeners.get("found-in-page")?.({}, { activeMatchOrdinal: 2, matches: 5 });

  expect(manager.getRuntimeState("pane-1")?.find).toEqual({
    query: "hello",
    activeMatch: 2,
    totalMatches: 5,
  });
});

test("showPane reapplies the stored zoom factor when a pane becomes visible again", () => {
  const zoomCalls: number[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          setZoomFactor: (zoom: number) => {
            zoomCalls.push(zoom);
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.setZoom("pane-1", 1.5);
  manager.showPane("pane-1");
  manager.hidePane("pane-1");
  manager.showPane("pane-1");

  expect(zoomCalls).toEqual([1.5, 1.5, 1.5]);
});

test("navigation actions and state use navigationHistory instead of deprecated webContents APIs", () => {
  const calls: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          canGoBack: () => {
            calls.push("deprecated-canGoBack");
            return false;
          },
          canGoForward: () => {
            calls.push("deprecated-canGoForward");
            return false;
          },
          goBack: () => {
            calls.push("deprecated-goBack");
          },
          goForward: () => {
            calls.push("deprecated-goForward");
          },
          navigationHistory: {
            canGoBack: () => {
              calls.push("history-canGoBack");
              return true;
            },
            canGoForward: () => {
              calls.push("history-canGoForward");
              return false;
            },
            goBack: () => {
              calls.push("history-goBack");
            },
            goForward: () => {
              calls.push("history-goForward");
            },
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.back("pane-1");
  manager.forward("pane-1");
  manager.applyRuntimePatch("pane-1", {});
  const runtimeBeforeSync = manager.getRuntimeState("pane-1");

  expect(runtimeBeforeSync?.canGoBack).toBe(false);

  const listeners = new Map<string, (...args: unknown[]) => void>();
  const syncManager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          canGoBack: () => {
            calls.push("deprecated-sync-canGoBack");
            return false;
          },
          canGoForward: () => {
            calls.push("deprecated-sync-canGoForward");
            return false;
          },
          navigationHistory: {
            canGoBack: () => {
              calls.push("history-sync-canGoBack");
              return true;
            },
            canGoForward: () => {
              calls.push("history-sync-canGoForward");
              return true;
            },
            goBack: () => {
              calls.push("history-sync-goBack");
            },
            goForward: () => {
              calls.push("history-sync-goForward");
            },
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  syncManager.createPane("pane-2", "https://example.com");
  listeners.get("did-stop-loading")?.();

  const runtimeState = syncManager.getRuntimeState("pane-2");
  expect(runtimeState?.canGoBack).toBe(true);
  expect(runtimeState?.canGoForward).toBe(true);
  expect(calls).toEqual([
    "history-goBack",
    "history-goForward",
    "history-sync-canGoBack",
    "history-sync-canGoForward",
  ]);
});

test("context-menu events emit a browser context-menu payload to the renderer", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          canGoBack: () => true,
          canGoForward: () => false,
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");
  manager.setBounds("pane-1", { x: 20, y: 40, width: 800, height: 600 });

  listeners.get("context-menu")?.(
    { preventDefault() {} },
    {
      x: 12,
      y: 16,
      linkURL: "https://devspace.example/docs",
      selectionText: "",
    },
  );

  expect(rendererMessages.at(-1)).toEqual({
    channel: "browser:contextMenuRequested",
    payload: {
      paneId: "pane-1",
      position: { x: 32, y: 56 },
      target: "link",
      pageUrl: "https://example.com",
      linkUrl: "https://devspace.example/docs",
      selectionText: null,
      canGoBack: true,
      canGoForward: false,
    },
  });
});

test("window.open requests are denied and emitted as open-in-new-tab requests", () => {
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  let windowOpenHandler: ((details: { url: string }) => { action: "deny" | "allow" }) | undefined;
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          setWindowOpenHandler: (
            handler: (details: { url: string }) => { action: "deny" | "allow" },
          ) => {
            windowOpenHandler = handler;
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");

  const result = windowOpenHandler?.({ url: "https://devspace.example/new-tab" });

  expect(result).toEqual({ action: "deny" });
  expect(rendererMessages.at(-1)).toEqual({
    channel: "browser:openInNewTabRequested",
    payload: {
      paneId: "pane-1",
      url: "https://devspace.example/new-tab",
    },
  });
});

test("destroying a pane denies any pending permission request for that pane", () => {
  let resolvedDecision: string | undefined;
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          id: 91,
          loadURL: () => Promise.resolve(),
          close: () => {},
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.requestPermission(
    {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
    (decision) => {
      resolvedDecision = decision;
    },
  );

  manager.destroyPane("pane-1");

  expect(resolvedDecision).toBe("deny");
});

test("permission requests are emitted to the renderer and resolved later", () => {
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  let resolvedDecision: string | undefined;
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");
  manager.requestPermission(
    {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
    (decision) => {
      resolvedDecision = decision;
    },
  );

  expect(rendererMessages.at(-1)).toEqual({
    channel: "browser:permissionRequested",
    payload: {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
  });

  manager.resolvePermission("token-1", "allow-for-session");

  expect(resolvedDecision).toBe("allow-for-session");
});

test("retrying a navigation clears the last browser failure state", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-fail-load")?.({}, -105, "NAME_NOT_RESOLVED", "https://bad.example", true);

  expect(manager.getRuntimeState("pane-1")?.failure?.kind).toBe("navigation");

  manager.navigate("pane-1", "https://retry.example");

  const runtimeState = manager.getRuntimeState("pane-1");
  expect(runtimeState?.isLoading).toBe(true);
  expect(runtimeState?.failure).toBe(null);
});

test("render-process-gone marks the pane as crashed", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("render-process-gone")?.({}, { reason: "crashed", exitCode: 9 });

  expect(manager.getRuntimeState("pane-1")?.failure).toEqual({
    kind: "crash",
    detail: "crashed",
    url: "https://example.com",
  });
});

test("committed navigations are recorded in browser history with devspace source", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const historyCalls: Array<{ url: string; title: string; source: string }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          getTitle: () => "Committed page",
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    historyService: {
      recordVisit: (entry: { url: string; title: string; source: string }) => {
        historyCalls.push(entry);
      },
    },
  } as never);

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-navigate")?.({}, "https://devspace.example/history");

  expect(historyCalls.length).toBe(1);
  expect(historyCalls[0]?.url).toBe("https://devspace.example/history");
  expect(historyCalls[0]?.title).toBe("https://devspace.example/history");
  expect(historyCalls[0]?.source).toBe("devspace");
});

test("editor pane navigations are excluded from persistent browser history", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const historyCalls: Array<{ url: string; title: string; source: string }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          getTitle: () => "VS Code",
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    historyService: {
      recordVisit: (entry: { url: string; title: string; source: string }) => {
        historyCalls.push(entry);
      },
    },
  } as never);

  manager.createPane(
    "editor-1",
    "http://127.0.0.1:18562/devspace-vscode?tkn=secret&folder=%2Ftmp",
    "editor",
  );
  listeners.get("did-navigate")?.(
    {},
    "http://127.0.0.1:18562/devspace-vscode?tkn=secret&folder=%2Ftmp",
  );

  expect(historyCalls).toEqual([]);
});

test("history capture avoids stale titles and refreshes when the real title arrives later", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const historyCalls: Array<{ url: string; title: string; source: string; visitedAt: number }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          getTitle: () => "Previous page",
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    historyService: {
      recordVisit: (entry: { url: string; title: string; source: string; visitedAt: number }) => {
        historyCalls.push(entry);
      },
    },
  } as never);

  manager.createPane("pane-1", "https://example.com");
  listeners.get("did-navigate")?.({}, "https://devspace.example/history");

  expect(historyCalls.length).toBe(1);
  expect(historyCalls[0]?.title).toBe("https://devspace.example/history");

  listeners.get("page-title-updated")?.({}, "Fresh page title");

  expect(historyCalls.length).toBe(2);
  expect(historyCalls[1]?.title).toBe("Fresh page title");
  expect(historyCalls[1]?.visitedAt).toBe(historyCalls[0]?.visitedAt);
});

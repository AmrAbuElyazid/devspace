import { beforeEach, test, expect, vi } from "vitest";
import { BrowserPaneManager } from "../browser-pane-manager";
import {
  getMainProcessPerformanceSnapshot,
  resetMainProcessPerformanceCounters,
} from "../../performance-monitor";

beforeEach(() => {
  resetMainProcessPerformanceCounters();
});

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

test("records browser pane lifecycle timings for profiling", () => {
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        setBounds: () => {},
        webContents: {
          close: () => {},
          loadURL: () => Promise.resolve(),
          setZoomFactor: () => Promise.resolve(),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  manager.showPane("pane-1");
  manager.setBounds("pane-1", { x: 10, y: 20, width: 300, height: 200 });
  manager.setVisiblePanes(["pane-1"]);
  manager.hidePane("pane-1");
  manager.destroyPane("pane-1");

  const snapshot = getMainProcessPerformanceSnapshot();

  expect(snapshot.operations).toMatchObject({
    "browser.createPane": { count: 1 },
    "browser.showPane": { count: 1 },
    "browser.setBounds": { count: 1 },
    "browser.setVisiblePanes": { count: 1 },
    "browser.hidePane": { count: 1 },
    "browser.destroyPane": { count: 1 },
  });
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

test("pinch-to-zoom is switched on for browser panes and re-armed per navigation", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const limits: Array<[number, number]> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setVisualZoomLevelLimits: (minimum: number, maximum: number) => {
            limits.push([minimum, maximum]);
            return Promise.resolve();
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");

  // Electron ships visual zoom disabled, so without this a trackpad pinch does
  // nothing whatsoever.
  expect(limits).toEqual([[1, 3]]);

  listeners.get("did-navigate")?.({}, "https://example.com/next");

  // The limits belong to the document that was loaded when they were set.
  expect(limits).toEqual([
    [1, 3],
    [1, 3],
  ]);
});

test("resetting the zoom also drops a pinched page back to life size", async () => {
  const limits: Array<[number, number]> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          setZoomFactor: () => Promise.resolve(),
          setVisualZoomLevelLimits: (minimum: number, maximum: number) => {
            limits.push([minimum, maximum]);
            return Promise.resolve();
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");
  limits.length = 0;
  manager.resetZoom("pane-1");

  // Pinning the ceiling to 1 is what forces the current scale down.
  expect(limits).toEqual([[1, 1]]);

  // The restore only goes out once that clamp has landed. Issued together the
  // two race, the ceiling is back up before anything is clamped, and the page
  // stays magnified — which is exactly the bug this ordering fixes.
  await Promise.resolve();
  await Promise.resolve();

  expect(limits).toEqual([
    [1, 1],
    [1, 3],
  ]);
});

test("pinch-to-zoom is left switched off for editor panes", () => {
  const limits: Array<[number, number]> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          setZoomFactor: () => Promise.resolve(),
          setVisualZoomLevelLimits: (minimum: number, maximum: number) => {
            limits.push([minimum, maximum]);
            return Promise.resolve();
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  manager.resetZoom("pane-1");

  // An editor pane is a full IDE with its own ideas about gestures.
  expect(limits).toEqual([]);
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

test("pointer-driven webcontents focus events are forwarded to the renderer", () => {
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

  listeners.get("before-mouse-event")?.({}, { type: "mouseDown" });
  listeners.get("focus")?.();

  expect(rendererMessages).toEqual([{ channel: "browser:focused", payload: "pane-1" }]);
});

test("focus events without a preceding pointer interaction are ignored", () => {
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

  expect(rendererMessages).toEqual([]);
});

test("clicks inside an already focused webcontents immediately sync pane focus", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          isFocused: () => true,
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

  listeners.get("before-mouse-event")?.({}, { type: "mouseDown" });
  listeners.get("focus")?.();

  expect(rendererMessages).toEqual([{ channel: "browser:focused", payload: "pane-1" }]);
});

test("the mouse back and forward buttons navigate a browser pane's history", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const navigations: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          navigationHistory: {
            goBack: () => navigations.push("back"),
            goForward: () => navigations.push("forward"),
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com");

  // Pressing must not navigate; Chromium acts on the release, and so does the
  // page that also sees the event.
  listeners.get("before-mouse-event")?.({}, { type: "mouseDown", button: "back" });
  expect(navigations).toEqual([]);

  listeners.get("before-mouse-event")?.({}, { type: "mouseUp", button: "back" });
  listeners.get("before-mouse-event")?.({}, { type: "mouseUp", button: "forward" });
  listeners.get("before-mouse-event")?.({}, { type: "mouseUp", button: "left" });

  expect(navigations).toEqual(["back", "forward"]);
});

test("the mouse back and forward buttons leave an editor pane's history alone", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const navigations: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          navigationHistory: {
            goBack: () => navigations.push("back"),
            goForward: () => navigations.push("forward"),
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com", "editor");

  listeners.get("before-mouse-event")?.({}, { type: "mouseUp", button: "back" });
  listeners.get("before-mouse-event")?.({}, { type: "mouseUp", button: "forward" });

  // The history behind an editor pane is the IDE's own, not a page's.
  expect(navigations).toEqual([]);
});

test("blur clears pending pointer-driven focus forwarding", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          isFocused: () => false,
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

  listeners.get("before-mouse-event")?.({}, { type: "mouseDown" });
  listeners.get("blur")?.();
  listeners.get("focus")?.();

  // The focus that follows the blur must not be forwarded as pointer-driven,
  // and the blur itself must stay silent: a pane blurs on every workspace
  // switch, so reporting the modifier as released there killed the shortcut
  // hints mid-⌘.
  expect(rendererMessages).toEqual([]);
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

test("editor focus enables menu-shortcut yielding until blur", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
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
    sendToRenderer: () => {},
  });

  manager.createPane("pane-1", "https://example.com", "editor");

  listeners.get("focus")?.();
  listeners.get("blur")?.();

  expect(setIgnoreMenuShortcuts).toHaveBeenNthCalledWith(1, true);
  expect(setIgnoreMenuShortcuts).toHaveBeenNthCalledWith(2, false);
});

test("editor panes still intercept the explicit leader shortcut", () => {
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
        action: "leader",
        channel: "app:leader",
        shortcut: { key: "k", command: true, shift: false, option: false, control: false },
      },
    ],
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "k", meta: true, control: false, shift: false, alt: false },
  );

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
  expect(rendererMessages).toContainEqual({ channel: "app:leader", payload: undefined });
});

test("editor panes no longer intercept close-window shortcuts", () => {
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

  expect(preventDefault).not.toHaveBeenCalled();
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
  expect(rendererMessages).toEqual([
    { channel: "window:nativeModifierChanged", payload: "command" },
  ]);
});

test("editor panes route standard copy and paste shortcuts to the native webcontents", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const setIgnoreMenuShortcuts = vi.fn();
  const copy = vi.fn();
  const paste = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts,
          copy,
          paste,
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [],
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "c", meta: true, control: false, shift: false, alt: false },
  );
  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "v", meta: true, control: false, shift: false, alt: false },
  );

  expect(copy).toHaveBeenCalledTimes(1);
  expect(paste).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(2);
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
  expect(rendererMessages).toEqual([
    { channel: "window:nativeModifierChanged", payload: "command" },
    { channel: "window:nativeModifierChanged", payload: "command" },
  ]);
});

test("editor panes leave select-all shortcuts to VS Code", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
  const preventDefault = vi.fn();
  const setIgnoreMenuShortcuts = vi.fn();
  const selectAll = vi.fn();
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: () => Promise.resolve(),
          setIgnoreMenuShortcuts,
          selectAll,
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: (channel, payload) => {
      rendererMessages.push({ channel, payload });
    },
    getAppShortcutBindings: () => [],
  });

  manager.createPane("pane-1", "https://example.com", "editor");
  rendererMessages.length = 0;

  listeners.get("before-input-event")?.(
    { preventDefault },
    { type: "keyDown", key: "a", meta: true, control: false, shift: false, alt: false },
  );

  expect(selectAll).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
  expect(setIgnoreMenuShortcuts).toHaveBeenCalledWith(true);
  expect(rendererMessages).toEqual([
    { channel: "window:nativeModifierChanged", payload: "command" },
  ]);
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

test("createPane re-navigates an existing pane when the requested URL changes", () => {
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
  manager.createPane("pane-1", "https://next.example.com");

  expect(loadCalls).toEqual(["https://example.com", "https://next.example.com"]);
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
      imageUrl: null,
      selectionText: null,
      canGoBack: true,
      canGoForward: false,
    },
  });
});

test("right-clicking an image emits an image target with its source URL", () => {
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
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
    sendToRenderer: (channel: string, payload: unknown) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("context-menu")?.(
    { preventDefault: () => {} },
    { x: 12, y: 20, mediaType: "image", srcURL: "https://example.com/logo.png" },
  );

  expect(rendererMessages.at(-1)).toMatchObject({
    channel: "browser:contextMenuRequested",
    payload: { target: "image", imageUrl: "https://example.com/logo.png", linkUrl: null },
  });
});

test("a selection inside a link takes precedence over the link target", () => {
  const rendererMessages: Array<{ channel: string; payload: unknown }> = [];
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
    sendToRenderer: (channel: string, payload: unknown) => {
      rendererMessages.push({ channel, payload });
    },
  });

  manager.createPane("pane-1", "https://example.com");
  listeners.get("context-menu")?.(
    { preventDefault: () => {} },
    { x: 12, y: 20, linkURL: "https://devspace.example/docs", selectionText: "docs" },
  );

  expect(rendererMessages.at(-1)).toMatchObject({
    channel: "browser:contextMenuRequested",
    payload: { target: "selection", selectionText: "docs" },
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

function createCrashTestManager(): {
  listeners: Map<string, (...args: unknown[]) => void>;
  loadedUrls: string[];
  manager: BrowserPaneManager;
} {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const loadedUrls: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          on: (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
          },
          loadURL: (url: string) => {
            loadedUrls.push(url);
            return Promise.resolve();
          },
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
  });

  return { listeners, loadedUrls, manager };
}

test("a first render-process-gone reloads the pane instead of surfacing a failure", async () => {
  vi.useFakeTimers();
  try {
    const { listeners, loadedUrls, manager } = createCrashTestManager();
    manager.createPane("pane-1", "https://example.com");
    loadedUrls.length = 0;

    listeners.get("render-process-gone")?.({}, { reason: "crashed", exitCode: 9 });

    // The pane reports as loading, not failed, while the reload is pending.
    expect(manager.getRuntimeState("pane-1")?.failure).toBe(null);
    expect(manager.getRuntimeState("pane-1")?.isLoading).toBe(true);
    expect(loadedUrls).toEqual([]);

    await vi.advanceTimersByTimeAsync(250);

    expect(loadedUrls).toEqual(["https://example.com"]);
  } finally {
    vi.useRealTimers();
  }
});

test("render-process-gone surfaces a crash once the retry budget is exhausted", async () => {
  vi.useFakeTimers();
  try {
    const { listeners, manager } = createCrashTestManager();
    manager.createPane("pane-1", "https://example.com");

    // Three attempts are budgeted per rolling window; the fourth gives up.
    for (const delay of [250, 500, 1_000]) {
      listeners.get("render-process-gone")?.({}, { reason: "crashed", exitCode: 9 });
      await vi.advanceTimersByTimeAsync(delay);
      expect(manager.getRuntimeState("pane-1")?.failure).toBe(null);
    }

    listeners.get("render-process-gone")?.({}, { reason: "crashed", exitCode: 9 });

    expect(manager.getRuntimeState("pane-1")?.failure).toEqual({
      kind: "crash",
      detail: "crashed",
      url: "https://example.com",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("a clean exit is not treated as a crash", async () => {
  vi.useFakeTimers();
  try {
    const { listeners, loadedUrls, manager } = createCrashTestManager();
    manager.createPane("pane-1", "https://example.com");
    loadedUrls.length = 0;

    listeners.get("render-process-gone")?.({}, { reason: "clean-exit", exitCode: 0 });
    await vi.advanceTimersByTimeAsync(1_000);

    // Neither a failure card nor a recovery reload: a clean exit is a pane
    // being torn down, and reloading one would resurrect it.
    expect(manager.getRuntimeState("pane-1")?.failure).toBe(null);
    expect(loadedUrls).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test("destroying a pane cancels its pending crash reload", async () => {
  vi.useFakeTimers();
  try {
    const { listeners, loadedUrls, manager } = createCrashTestManager();
    manager.createPane("pane-1", "https://example.com");
    loadedUrls.length = 0;

    listeners.get("render-process-gone")?.({}, { reason: "crashed", exitCode: 9 });
    manager.destroyPane("pane-1");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(loadedUrls).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
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

test("a reactive focus request is dropped while the window is in the background", () => {
  // `webContents.focus()` is not pane-local on macOS: Electron routes it
  // through the owning window's Focus(true), which activates the app and
  // orders the window front. A pane that came back on screen by itself must
  // not be able to do that from behind another app.
  const focusCalls: string[] = [];
  let windowFocused = false;
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          focus: () => focusCalls.push("focus"),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    isWindowFocused: () => windowFocused,
  });

  manager.createPane("pane-1", "https://example.com");

  manager.focusPane("pane-1", "reactive");
  expect(focusCalls).toEqual([]);

  // The user is looking at the app: recovery should put the keyboard back.
  windowFocused = true;
  manager.focusPane("pane-1", "reactive");
  expect(focusCalls).toEqual(["focus"]);
});

test("a user focus request is honoured even from the background", () => {
  // Clicking a row in the collapsed sidebar's hover panel, for instance: the
  // panel is a non-focusable child window, so the parent is not key when the
  // click lands, and coming to the front is exactly what was asked for.
  const focusCalls: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          focus: () => focusCalls.push("focus"),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    isWindowFocused: () => false,
  });

  manager.createPane("pane-1", "https://example.com");
  manager.focusPane("pane-1", "user");

  expect(focusCalls).toEqual(["focus"]);
});

test("focus defaults to a user request when no reason is given", () => {
  const focusCalls: string[] = [];
  const manager = new BrowserPaneManager({
    createView: () =>
      ({
        webContents: {
          loadURL: () => Promise.resolve(),
          focus: () => focusCalls.push("focus"),
        },
      }) as never,
    addChildView: () => {},
    removeChildView: () => {},
    sendToRenderer: () => {},
    isWindowFocused: () => false,
  });

  manager.createPane("pane-1", "https://example.com");
  manager.focusPane("pane-1");

  expect(focusCalls).toEqual(["focus"]);
});

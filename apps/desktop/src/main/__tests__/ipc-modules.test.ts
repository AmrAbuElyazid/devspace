import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  callRegisteredHandler,
  createElectronIpcMock,
  createIpcHandlerRegistry,
} from "./test-utils/mock-electron-ipc";

const handlers = createIpcHandlerRegistry();
const rendererMessages: unknown[][] = [];
const windowCalls: unknown[][] = [];
const terminalCalls: unknown[][] = [];
const browserPaneCalls: unknown[][] = [];
const editorCalls: unknown[][] = [];
const t3codeCalls: unknown[][] = [];
const browserImportCalls: unknown[][] = [];
const browserSessionCalls: unknown[][] = [];
const shellCalls: string[] = [];
const mainWindowEventHandlers = new Map<string, () => void>();
const tempDirs: string[] = [];

let isMaximized = false;
let isFullScreen = false;
let nextOpenDialogResult: { canceled: boolean; filePaths: string[] } = {
  canceled: true,
  filePaths: [],
};
let builtMenuTemplate: Array<{ label?: string; type?: string; click?: () => void }> = [];
let lastPopupOptions: Record<string, unknown> | undefined;
let terminalCreateError: Error | undefined;

vi.mock("electron", () =>
  createElectronIpcMock(handlers, {
    dialog: {
      showOpenDialog: async () => nextOpenDialogResult,
    },
    shell: {
      openExternal: (url: string) => {
        shellCalls.push(url);
      },
    },
    menu: {
      buildFromTemplate: (
        template: Array<{ label?: string; type?: string; click?: () => void }>,
      ) => {
        builtMenuTemplate = template;
        return {
          popup: (options: Record<string, unknown>) => {
            lastPopupOptions = options;
          },
        };
      },
    },
  }),
);

const { registerBrowserIpc } = await import("../ipc/browser");
const { registerSystemIpc } = await import("../ipc/system");
const { registerTerminalAndEditorIpc } = await import("../ipc/terminal-editor");

const terminalEventHandlers: Partial<{
  titleChanged: (surfaceId: string, title: string) => void;
  surfaceClosed: (surfaceId: string) => void;
  surfaceFocused: (surfaceId: string) => void;
  modifierChanged: (modifier: string | null) => void;
  pwdChanged: (surfaceId: string, pwd: string) => void;
  searchStart: (surfaceId: string, needle: string) => void;
  searchEnd: (surfaceId: string) => void;
  searchTotal: (surfaceId: string, total: number) => void;
  searchSelected: (surfaceId: string, selected: number) => void;
}> = {};

const mainWindowMock = {
  webContents: {
    send: (...args: unknown[]) => {
      rendererMessages.push(args);
    },
    focus: () => {
      windowCalls.push(["focusContent"]);
    },
  },
  contentView: {
    children: [
      {
        webContents: { id: 17 },
        getBounds: () => ({ x: 24, y: 44, width: 900, height: 700 }),
      },
    ],
  },
  on: (event: string, handler: () => void) => {
    mainWindowEventHandlers.set(event, handler);
  },
  minimize: () => {
    windowCalls.push(["minimize"]);
  },
  isMaximized: () => isMaximized,
  isFullScreen: () => isFullScreen,
  unmaximize: () => {
    windowCalls.push(["unmaximize"]);
  },
  maximize: () => {
    windowCalls.push(["maximize"]);
  },
  setWindowButtonPosition: (position: unknown) => {
    windowCalls.push(["setWindowButtonPosition", position]);
  },
  close: () => {
    windowCalls.push(["close"]);
  },
};

const terminalManagerMock = {
  createSurface: (surfaceId: string, options?: unknown) => {
    if (terminalCreateError) {
      const error = terminalCreateError;
      terminalCreateError = undefined;
      throw error;
    }

    terminalCalls.push(["createSurface", surfaceId, options]);
  },
  destroySurface: (surfaceId: string) => {
    terminalCalls.push(["destroySurface", surfaceId]);
  },
  showSurface: (surfaceId: string) => {
    terminalCalls.push(["showSurface", surfaceId]);
  },
  hideSurface: (surfaceId: string) => {
    terminalCalls.push(["hideSurface", surfaceId]);
  },
  focusSurface: (surfaceId: string) => {
    terminalCalls.push(["focusSurface", surfaceId]);
  },
  setVisibleSurfaces: (surfaceIds: string[]) => {
    terminalCalls.push(["setVisibleSurfaces", surfaceIds]);
  },
  blurSurfaces: () => {
    terminalCalls.push(["blurSurfaces"]);
  },
  sendBindingAction: (surfaceId: string, action: string) => {
    terminalCalls.push(["sendBindingAction", surfaceId, action]);
    return true;
  },
  setBounds: (surfaceId: string, bounds: unknown) => {
    terminalCalls.push(["setBounds", surfaceId, bounds]);
  },
  onTitleChanged: (callback: (surfaceId: string, title: string) => void) => {
    terminalEventHandlers.titleChanged = callback;
  },
  onSurfaceClosed: (callback: (surfaceId: string) => void) => {
    terminalEventHandlers.surfaceClosed = callback;
  },
  onSurfaceFocused: (callback: (surfaceId: string) => void) => {
    terminalEventHandlers.surfaceFocused = callback;
  },
  onModifierChanged: (callback: (modifier: string | null) => void) => {
    terminalEventHandlers.modifierChanged = callback;
  },
  onPwdChanged: (callback: (surfaceId: string, pwd: string) => void) => {
    terminalEventHandlers.pwdChanged = callback;
  },
  onSearchStart: (callback: (surfaceId: string, needle: string) => void) => {
    terminalEventHandlers.searchStart = callback;
  },
  onSearchEnd: (callback: (surfaceId: string) => void) => {
    terminalEventHandlers.searchEnd = callback;
  },
  onSearchTotal: (callback: (surfaceId: string, total: number) => void) => {
    terminalEventHandlers.searchTotal = callback;
  },
  onSearchSelected: (callback: (surfaceId: string, selected: number) => void) => {
    terminalEventHandlers.searchSelected = callback;
  },
};

const browserPaneManagerMock = {
  createPane: (paneId: string, url: string, kind?: string) => {
    browserPaneCalls.push(["createPane", paneId, url, kind]);
  },
  destroyPane: (paneId: string) => {
    browserPaneCalls.push(["destroyPane", paneId]);
  },
  showPane: (paneId: string) => {
    browserPaneCalls.push(["showPane", paneId]);
  },
  hidePane: (paneId: string) => {
    browserPaneCalls.push(["hidePane", paneId]);
  },
  setVisiblePanes: (paneIds: string[]) => {
    browserPaneCalls.push(["setVisiblePanes", paneIds]);
  },
  getRuntimeState: (paneId: string) => {
    browserPaneCalls.push(["getRuntimeState", paneId]);
    return {
      paneId,
      url: "https://example.com/",
      title: "Example",
      faviconUrl: null,
      isLoading: false,
      canGoBack: true,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: null,
      failure: null,
    };
  },
  navigate: (paneId: string, url: string) => {
    browserPaneCalls.push(["navigate", paneId, url]);
  },
  back: (paneId: string) => {
    browserPaneCalls.push(["back", paneId]);
  },
  forward: (paneId: string) => {
    browserPaneCalls.push(["forward", paneId]);
  },
  reload: (paneId: string) => {
    browserPaneCalls.push(["reload", paneId]);
  },
  stop: (paneId: string) => {
    browserPaneCalls.push(["stop", paneId]);
  },
  setBounds: (paneId: string, bounds: unknown) => {
    browserPaneCalls.push(["setBounds", paneId, bounds]);
  },
  focusPane: (paneId: string) => {
    browserPaneCalls.push(["focusPane", paneId]);
  },
  setZoom: (paneId: string, zoom: number) => {
    browserPaneCalls.push(["setZoom", paneId, zoom]);
  },
  resetZoom: (paneId: string) => {
    browserPaneCalls.push(["resetZoom", paneId]);
  },
  findInPage: (paneId: string, query: string, options?: unknown) => {
    browserPaneCalls.push(["findInPage", paneId, query, options]);
  },
  stopFindInPage: (paneId: string, action?: unknown) => {
    browserPaneCalls.push(["stopFindInPage", paneId, action]);
  },
  toggleDevTools: (paneId: string) => {
    browserPaneCalls.push(["toggleDevTools", paneId]);
  },
  showContextMenu: (paneId: string, position?: unknown) => {
    browserPaneCalls.push(["showContextMenu", paneId, position]);
  },
  resolvePermission: (requestToken: string, decision: string) => {
    browserPaneCalls.push(["resolvePermission", requestToken, decision]);
  },
};

const vscodeServerManagerMock = {
  keepRunning: false,
  isAvailable: (configuredCli?: string) => {
    editorCalls.push(["isAvailable", configuredCli]);
    return true;
  },
  getCliStatus: (configuredCli?: string) => {
    editorCalls.push(["getCliStatus", configuredCli]);
    return { path: "/usr/local/bin/code", source: "configured-command" as const };
  },
  start: async (folder?: string, configuredCli?: string) => {
    editorCalls.push(["start", folder, configuredCli]);
    return {
      url: folder
        ? `http://127.0.0.1:18562?folder=${encodeURIComponent(folder)}`
        : "http://127.0.0.1:18562",
    };
  },
  release: (folder?: string) => {
    editorCalls.push(["release", folder]);
  },
};

const t3codeServerManagerMock = {
  isAvailable: () => true,
  start: async () => {
    t3codeCalls.push(["start"]);
    return { url: "http://127.0.0.1:31415" };
  },
  release: () => {
    t3codeCalls.push(["release"]);
  },
};

const browserImportServiceMock = {
  listProfiles: async (browser: string) => {
    browserImportCalls.push(["listProfiles", browser]);
    return [{ name: "Profile 1", path: "/tmp/Profile 1", browser: "chrome" as const }];
  },
  importBrowser: async (browser: string, profilePath: string | null, mode: string) => {
    browserImportCalls.push(["importBrowser", browser, profilePath, mode]);
    return { ok: true, importedCookies: 2, importedHistory: 3 };
  },
  detectAccess: async (browser: string, mode: string) => {
    browserImportCalls.push(["detectAccess", browser, mode]);
    return { ok: true };
  },
  clearBrowsingData: async (target: string) => {
    browserImportCalls.push(["clearBrowsingData", target]);
    return { ok: true };
  },
};

const browserSessionManagerMock = {
  registerTrustedLocalOrigin: (url: string) => {
    browserSessionCalls.push(["registerTrustedLocalOrigin", url]);
  },
  unregisterTrustedLocalOrigin: (url: string) => {
    browserSessionCalls.push(["unregisterTrustedLocalOrigin", url]);
  },
};

registerTerminalAndEditorIpc(
  mainWindowMock as never,
  terminalManagerMock as never,
  browserPaneManagerMock as never,
  vscodeServerManagerMock as never,
  t3codeServerManagerMock as never,
  browserSessionManagerMock as never,
);
registerBrowserIpc(
  mainWindowMock as never,
  browserPaneManagerMock as never,
  browserImportServiceMock as never,
);
registerSystemIpc(mainWindowMock as never);

function callHandler(channel: string, ...args: unknown[]) {
  return callRegisteredHandler(handlers, channel, ...args);
}

function emitToChannel(channel: string, event: unknown, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler for ${channel}`);
  }

  return handler(event, ...args);
}

beforeEach(() => {
  rendererMessages.length = 0;
  windowCalls.length = 0;
  terminalCalls.length = 0;
  browserPaneCalls.length = 0;
  editorCalls.length = 0;
  t3codeCalls.length = 0;
  browserImportCalls.length = 0;
  browserSessionCalls.length = 0;
  shellCalls.length = 0;
  isMaximized = false;
  isFullScreen = false;
  nextOpenDialogResult = { canceled: true, filePaths: [] };
  builtMenuTemplate = [];
  lastPopupOptions = undefined;
  terminalCreateError = undefined;
  vscodeServerManagerMock.keepRunning = false;
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("terminal IPC sanitizes inputs and forwards lifecycle actions", async () => {
  const createResult = await callHandler("terminal:create", "surface-1", {
    cwd: "/tmp/project",
    envVars: {
      GOOD: "1",
      IGNORE_ME: 2,
      ALSO_GOOD: "two",
    },
  });

  emitToChannel("terminal:setVisibleSurfaces", {}, ["surface-1", 42, "surface-2"]);
  emitToChannel("terminal:setBounds", {}, "surface-1", { x: 10, y: 20, width: 300, height: 180 });
  emitToChannel("terminal:focus", {}, "surface-1");
  await callHandler("terminal:show", "surface-1");
  await callHandler("terminal:hide", "surface-1");
  await callHandler("terminal:destroy", "surface-1");
  const bindingResult = await callHandler(
    "terminal:sendBindingAction",
    "surface-1",
    "copy_to_clipboard",
  );

  terminalCreateError = new Error("native create failed");
  const errorResult = await callHandler("terminal:create", "surface-2", { envVars: { BAD: 1 } });

  expect(createResult).toEqual({ ok: true });
  expect(bindingResult).toBe(true);
  expect(errorResult).toEqual({ error: "native create failed" });
  expect(terminalCalls).toEqual([
    [
      "createSurface",
      "surface-1",
      { cwd: "/tmp/project", envVars: { GOOD: "1", ALSO_GOOD: "two" } },
    ],
    ["setVisibleSurfaces", ["surface-1", "surface-2"]],
    ["setBounds", "surface-1", { x: 10, y: 20, width: 300, height: 180 }],
    ["focusSurface", "surface-1"],
    ["showSurface", "surface-1"],
    ["hideSurface", "surface-1"],
    ["destroySurface", "surface-1"],
    ["sendBindingAction", "surface-1", "copy_to_clipboard"],
  ]);
});

test("terminal blur restores renderer focus and forwards native terminal events", () => {
  const focus = vi.fn();

  emitToChannel("terminal:blur", { sender: { focus } });
  terminalEventHandlers.titleChanged?.("surface-1", "Shell");
  terminalEventHandlers.modifierChanged?.("command");
  terminalEventHandlers.searchTotal?.("surface-1", 3);

  expect(terminalCalls).toEqual([["blurSurfaces"]]);
  expect(rendererMessages).toEqual([
    ["window:nativeModifierChanged", null],
    ["terminal:titleChanged", "surface-1", "Shell"],
    ["window:nativeModifierChanged", "command"],
    ["terminal:searchTotal", "surface-1", 3],
  ]);
  expect(focus).toHaveBeenCalledTimes(1);
});

test("editor IPC replaces existing pane sessions and tracks trusted local origins", async () => {
  const first = await callHandler(
    "editor:start",
    "editor-pane-restart",
    "/tmp/project-a",
    "/custom/code",
  );
  const second = await callHandler(
    "editor:start",
    "editor-pane-restart",
    "/tmp/project-b",
    "/custom/code",
  );
  emitToChannel("editor:setKeepServerRunning", {}, true);
  await callHandler("editor:stop", "editor-pane-restart");

  expect(first).toEqual({ url: "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-a" });
  expect(second).toEqual({ url: "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-b" });
  expect(vscodeServerManagerMock.keepRunning).toBe(true);
  expect(editorCalls).toEqual([
    ["start", "/tmp/project-a", "/custom/code"],
    ["start", "/tmp/project-b", "/custom/code"],
    ["release", "/tmp/project-a"],
    ["release", "/tmp/project-b"],
  ]);
  expect(browserSessionCalls).toEqual([
    ["registerTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-a"],
    ["unregisterTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-a"],
    ["registerTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-b"],
    ["unregisterTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-b"],
  ]);
  expect(browserPaneCalls).toEqual([
    [
      "createPane",
      "editor-pane-restart",
      "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-a",
      "editor",
    ],
    [
      "createPane",
      "editor-pane-restart",
      "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject-b",
      "editor",
    ],
    ["destroyPane", "editor-pane-restart"],
  ]);
});

test("t3code IPC manages trusted origins and pane teardown", async () => {
  const result = await callHandler("t3code:start", "t3code-pane-1");
  await callHandler("t3code:stop", "t3code-pane-1");

  expect(result).toEqual({ url: "http://127.0.0.1:31415" });
  expect(t3codeCalls).toEqual([["start"], ["release"]]);
  expect(browserSessionCalls).toEqual([
    ["registerTrustedLocalOrigin", "http://127.0.0.1:31415"],
    ["unregisterTrustedLocalOrigin", "http://127.0.0.1:31415"],
  ]);
  expect(browserPaneCalls).toEqual([
    ["createPane", "t3code-pane-1", "http://127.0.0.1:31415", "t3code"],
    ["destroyPane", "t3code-pane-1"],
  ]);
});

test("browser IPC forwards pane commands and filters pane id lists", async () => {
  const runtimeState = await callHandler("browser:getRuntimeState", "pane-1");

  await callHandler("browser:show", "pane-1");
  await callHandler("browser:hide", "pane-1");
  await callHandler("browser:back", "pane-1");
  await callHandler("browser:forward", "pane-1");
  await callHandler("browser:reload", "pane-1");
  await callHandler("browser:stop", "pane-1");
  await callHandler("browser:resetZoom", "pane-1");
  await callHandler("browser:toggleDevTools", "pane-1");
  await callHandler("browser:destroy", "pane-1");
  emitToChannel("browser:setVisiblePanes", {}, ["pane-1", null, "pane-2"]);
  emitToChannel("browser:setFocus", {}, "pane-1");

  expect(runtimeState).toEqual({
    paneId: "pane-1",
    url: "https://example.com/",
    title: "Example",
    faviconUrl: null,
    isLoading: false,
    canGoBack: true,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });
  expect(browserPaneCalls).toEqual([
    ["getRuntimeState", "pane-1"],
    ["showPane", "pane-1"],
    ["hidePane", "pane-1"],
    ["back", "pane-1"],
    ["forward", "pane-1"],
    ["reload", "pane-1"],
    ["stop", "pane-1"],
    ["resetZoom", "pane-1"],
    ["toggleDevTools", "pane-1"],
    ["destroyPane", "pane-1"],
    ["setVisiblePanes", ["pane-1", "pane-2"]],
    ["focusPane", "pane-1"],
  ]);
});

test("browser IPC validates zoom, context menu, profile, and detect access inputs", async () => {
  await callHandler("browser:setZoom", "pane-1", 1.25);
  await callHandler("browser:setZoom", "pane-1", Infinity);
  await callHandler("browser:findInPage", "pane-1", "search", { findNext: true });
  await callHandler("browser:stopFindInPage", "pane-1", "keepSelection");
  await callHandler("browser:showContextMenu", "pane-1", { x: 10, y: 20 });
  await callHandler("browser:showContextMenu", "pane-1", { x: "bad", y: 20 });
  await callHandler("browser:showContextMenu", "pane-1", "not-an-object");
  const profiles = await callHandler("browser:listProfiles", "chrome");
  const invalidProfiles = await callHandler("browser:listProfiles", "firefox");
  const detectAccess = await callHandler("browser:detectAccess", "chrome", "history");
  const invalidDetectAccess = await callHandler("browser:detectAccess", "firefox", "history");

  expect(profiles).toEqual([{ name: "Profile 1", path: "/tmp/Profile 1", browser: "chrome" }]);
  expect(invalidProfiles).toEqual([]);
  expect(detectAccess).toEqual({ ok: true });
  expect(invalidDetectAccess).toEqual({
    ok: false,
    code: "INVALID_BROWSER_IMPORT_SOURCE",
    message: "Invalid browser or import mode.",
  });
  expect(browserPaneCalls).toEqual([
    ["setZoom", "pane-1", 1.25],
    ["findInPage", "pane-1", "search", { findNext: true }],
    ["stopFindInPage", "pane-1", "keepSelection"],
    ["showContextMenu", "pane-1", { x: 10, y: 20 }],
    ["showContextMenu", "pane-1", undefined],
  ]);
  expect(browserImportCalls).toEqual([
    ["listProfiles", "chrome"],
    ["detectAccess", "chrome", "history"],
  ]);
});

test("system IPC forwards window actions and native window events", async () => {
  await emitToChannel("window:minimize", {});
  await emitToChannel("window:maximize", {});
  isMaximized = true;
  await emitToChannel("window:maximize", {});
  await emitToChannel("window:focusContent", {});
  await emitToChannel("window:close", {});
  await emitToChannel("window:setSidebarOpen", {}, false);
  await emitToChannel("window:setSidebarOpen", {}, true);

  mainWindowEventHandlers.get("maximize")?.();
  mainWindowEventHandlers.get("unmaximize")?.();
  mainWindowEventHandlers.get("enter-full-screen")?.();
  mainWindowEventHandlers.get("leave-full-screen")?.();

  expect(windowCalls).toEqual([
    ["minimize"],
    ["maximize"],
    ["unmaximize"],
    ["focusContent"],
    ["close"],
    ["setWindowButtonPosition", { x: 16, y: 6 }],
    ["setWindowButtonPosition", { x: 16, y: 18 }],
  ]);
  expect(rendererMessages).toEqual([
    ["window:maximizeChange", true],
    ["window:maximizeChange", false],
    ["window:fullScreenChange", true],
    ["window:fullScreenChange", false],
  ]);
});

test("system IPC only opens allowlisted external URLs", async () => {
  await emitToChannel("shell:openExternal", {}, "https://example.com");
  await emitToChannel(
    "shell:openExternal",
    {},
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  );
  await emitToChannel("shell:openExternal", {}, "javascript:alert(1)");

  expect(shellCalls).toEqual([
    "https://example.com/",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  ]);
});

test("system openFile IPC returns file contents and null when canceled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "devspace-ipc-"));
  tempDirs.push(dir);
  const filePath = join(dir, "sample.md");
  await writeFile(filePath, "# Sample", "utf-8");

  nextOpenDialogResult = { canceled: false, filePaths: [filePath] };
  const result = await callHandler("dialog:openFile", dir);

  nextOpenDialogResult = { canceled: true, filePaths: [] };
  const canceled = await callHandler("dialog:openFile");

  expect(result).toEqual({ path: filePath, content: "# Sample" });
  expect(canceled).toBeNull();
});

test("system context menu IPC builds the menu and resolves the clicked item", async () => {
  const selection = callHandler(
    "contextMenu:show",
    [
      { id: "open", label: "Open" },
      { id: "delete", label: "Delete", destructive: true },
    ],
    { x: 10.8, y: 20.2 },
  ) as Promise<string | null>;

  expect(builtMenuTemplate.map((item) => item.type ?? item.label)).toEqual([
    "Open",
    "separator",
    "Delete",
  ]);
  expect(lastPopupOptions).toMatchObject({ x: 10, y: 20, window: mainWindowMock });

  builtMenuTemplate[2]?.click?.();

  await expect(selection).resolves.toBe("delete");
});

import { expect, test, vi } from "vitest";
import { createElectronIpcMock, createIpcHandlerRegistry } from "./test-utils/mock-electron-ipc";

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = createIpcHandlerRegistry();
const controllerCalls: unknown[][] = [];
const browserImportCalls: unknown[][] = [];
const editorCalls: unknown[][] = [];
const mainWindowCalls: unknown[][] = [];
const browserSessionCalls: unknown[][] = [];

vi.mock("electron", () => createElectronIpcMock(handlers));

const { registerIpcHandlers } = await import("../ipc-handlers");

const mainWindowMock = {
  webContents: { send: (..._args: unknown[]) => {} },
  contentView: {
    children: [
      {
        webContents: { id: 17 },
        getBounds: () => ({ x: 24, y: 44, width: 900, height: 700 }),
      },
    ],
  },
  on: (..._args: unknown[]) => {},
  minimize: () => {},
  isMaximized: () => false,
  isFullScreen: () => false,
  unmaximize: () => {},
  maximize: () => {},
  setWindowButtonPosition: (position: unknown) => {
    mainWindowCalls.push(["setWindowButtonPosition", position]);
  },
  close: () => {},
};

const terminalManagerMock = {
  createSurface: (..._args: unknown[]) => {},
  destroySurface: (..._args: unknown[]) => {},
  showSurface: (..._args: unknown[]) => {},
  hideSurface: (..._args: unknown[]) => {},
  focusSurface: (..._args: unknown[]) => {},
  setBounds: (..._args: unknown[]) => {},
  onTitleChanged: (..._args: unknown[]) => {},
  onSurfaceClosed: (..._args: unknown[]) => {},
  onSurfaceFocused: (..._args: unknown[]) => {},
  onModifierChanged: (..._args: unknown[]) => {},
  onPwdChanged: (..._args: unknown[]) => {},
  onSearchStart: (..._args: unknown[]) => {},
  onSearchEnd: (..._args: unknown[]) => {},
  onSearchTotal: (..._args: unknown[]) => {},
  onSearchSelected: (..._args: unknown[]) => {},
  destroyAll: () => {},
};

const browserPaneManagerMock = {
  createPane: (paneId: string, url: string) => {
    controllerCalls.push(["createPane", paneId, url]);
  },
  destroyPane: (..._args: unknown[]) => {},
  showPane: (..._args: unknown[]) => {},
  hidePane: (..._args: unknown[]) => {},
  getRuntimeState: (..._args: unknown[]) => undefined,
  navigate: (paneId: string, url: string) => {
    controllerCalls.push(["navigate", paneId, url]);
  },
  back: (..._args: unknown[]) => {},
  forward: (..._args: unknown[]) => {},
  reload: (..._args: unknown[]) => {},
  stop: (..._args: unknown[]) => {},
  setBounds: (paneId: string, bounds: unknown) => {
    controllerCalls.push(["setBounds", paneId, bounds]);
  },
  focusPane: (..._args: unknown[]) => {},
  setZoom: (..._args: unknown[]) => {},
  resetZoom: (..._args: unknown[]) => {},
  findInPage: (..._args: unknown[]) => {},
  stopFindInPage: (..._args: unknown[]) => {},
  toggleDevTools: (..._args: unknown[]) => {},
  showContextMenu: (..._args: unknown[]) => {},
  resolvePermission: (requestToken: string, decision: string) => {
    controllerCalls.push(["resolvePermission", requestToken, decision]);
  },
};

const vscodeServerManagerMock = {
  isAvailable: (configuredCli?: string) => {
    editorCalls.push(["isAvailable", configuredCli]);
    return false;
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
  release: (..._args: unknown[]) => {},
  stopAll: () => {},
};

const t3codeServerManagerMock = {
  isAvailable: () => false,
  start: async () => ({ url: "http://127.0.0.1:31415" }),
  release: (..._args: unknown[]) => {},
  stopAll: () => {},
};

const browserImportServiceMock = {
  listProfiles: async (browser: string) => {
    if (browser === "chrome") {
      return [{ name: "Profile 1", path: "/tmp/Profile 1", browser: "chrome" as const }];
    }
    return [];
  },
  importBrowser: async (browser: string, profilePath: string | null, mode: string) => {
    browserImportCalls.push(["importBrowser", browser, profilePath, mode]);
    return { ok: true, importedCookies: 0, importedHistory: 0 };
  },
  detectAccess: async () => ({ ok: true }),
  clearBrowsingData: async () => ({ ok: true }),
};

const browserSessionManagerMock = {
  registerTrustedLocalOrigin: (url: string) => {
    browserSessionCalls.push(["registerTrustedLocalOrigin", url]);
  },
  unregisterTrustedLocalOrigin: (url: string) => {
    browserSessionCalls.push(["unregisterTrustedLocalOrigin", url]);
  },
};

registerIpcHandlers(
  mainWindowMock as never,
  terminalManagerMock as never,
  browserPaneManagerMock as never,
  vscodeServerManagerMock as never,
  t3codeServerManagerMock as never,
  browserImportServiceMock as never,
  browserSessionManagerMock as never,
);

test("browser resolvePermission IPC accepts spec permission choices", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:resolvePermission")?.({}, "token-1", "allow-once");

  expect(controllerCalls).toEqual([["resolvePermission", "token-1", "allow-once"]]);
});

test("browser create IPC only forwards allowlisted URLs", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:create")?.({}, "pane-1", "https://example.com");
  await handlers.get("browser:create")?.({}, "pane-2", "javascript:alert(1)");

  expect(controllerCalls).toEqual([["createPane", "pane-1", "https://example.com/"]]);
});

test("browser navigate IPC rejects unsupported URL schemes", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:navigate")?.({}, "pane-1", "about:blank");
  await handlers.get("browser:navigate")?.({}, "pane-1", "file:///etc/passwd");

  expect(controllerCalls).toEqual([["navigate", "pane-1", "about:blank"]]);
});

test("browser setBounds translates renderer viewport bounds into contentView coordinates", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:setBounds")?.(
    { sender: { id: 17, getZoomFactor: () => 1 } },
    "pane-1",
    { x: 100, y: 200, width: 640, height: 480 },
  );

  expect(controllerCalls).toEqual([
    ["setBounds", "pane-1", { x: 124, y: 244, width: 640, height: 480 }],
  ]);
});

test("browser import IPC forwards supported import modes", async () => {
  browserImportCalls.length = 0;

  await handlers.get("browser:import")?.({}, "chrome", "/tmp/Profile 1", "history");
  await handlers.get("browser:import")?.({}, "safari", null, "cookies");

  expect(browserImportCalls).toEqual([
    ["importBrowser", "chrome", "/tmp/Profile 1", "history"],
    ["importBrowser", "safari", null, "cookies"],
  ]);
});

test("browser import IPC rejects profile paths outside discovered profiles", async () => {
  browserImportCalls.length = 0;

  const result = await handlers.get("browser:import")?.(
    {},
    "chrome",
    "/tmp/not-a-real-profile",
    "history",
  );

  expect(result).toEqual({
    ok: false,
    code: "INVALID_BROWSER_PROFILE",
    importedCookies: 0,
    importedHistory: 0,
  });
  expect(browserImportCalls).toEqual([]);
});

test("browser clearData IPC forwards to clearBrowsingData", async () => {
  const result = await handlers.get("browser:clearData")?.({}, "everything");

  expect(result).toEqual({ ok: true });
});

test("browser clearData IPC rejects invalid target", async () => {
  const result = await handlers.get("browser:clearData")?.({}, "invalid");

  expect(result).toEqual({ ok: false, error: "Invalid clear data target." });
});

test("browser detectAccess IPC returns ok for non-Safari browsers", async () => {
  const result = await handlers.get("browser:detectAccess")?.({}, "chrome");

  expect(result).toEqual({ ok: true });
});

test("browser import IPC rejects invalid browser source", async () => {
  const result = await handlers.get("browser:import")?.({}, "invalid-browser", null, "everything");

  expect(result).toEqual({
    ok: false,
    code: "INVALID_BROWSER_IMPORT_SOURCE",
    importedCookies: 0,
    importedHistory: 0,
  });
});

test("browser import IPC rejects invalid import mode", async () => {
  const result = await handlers.get("browser:import")?.({}, "safari", null, "invalid-mode");

  expect(result).toEqual({
    ok: false,
    code: "INVALID_BROWSER_IMPORT_MODE",
    importedCookies: 0,
    importedHistory: 0,
  });
});

test("window setSidebarOpen IPC updates native traffic light position", async () => {
  mainWindowCalls.length = 0;

  await handlers.get("window:setSidebarOpen")?.({}, false);
  await handlers.get("window:setSidebarOpen")?.({}, true);

  expect(mainWindowCalls).toEqual([
    ["setWindowButtonPosition", { x: 16, y: 6 }],
    ["setWindowButtonPosition", { x: 16, y: 18 }],
  ]);
});

test("window isFullScreen IPC returns the native fullscreen state", async () => {
  const result = await handlers.get("window:isFullScreen")?.({});

  expect(result).toBe(false);
});

test("editor CLI status IPC returns the resolved CLI status", async () => {
  editorCalls.length = 0;

  const result = await handlers.get("editor:getCliStatus")?.({}, "code-insiders");

  expect(result).toEqual({ path: "/usr/local/bin/code", source: "configured-command" });
  expect(editorCalls).toEqual([["getCliStatus", "code-insiders"]]);
});

test("editor start and stop track trusted local origins for shared-session CORS", async () => {
  editorCalls.length = 0;
  browserSessionCalls.length = 0;

  await handlers.get("editor:isAvailable")?.({}, "/custom/code");
  const result = await handlers.get("editor:start")?.({}, "pane-1", "/tmp/project", "/custom/code");
  await handlers.get("editor:stop")?.({}, "pane-1");

  expect(result).toEqual({
    url: "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject",
  });
  expect(editorCalls).toEqual([
    ["isAvailable", "/custom/code"],
    ["start", "/tmp/project", "/custom/code"],
  ]);
  expect(browserSessionCalls).toEqual([
    ["registerTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject"],
    ["unregisterTrustedLocalOrigin", "http://127.0.0.1:18562?folder=%2Ftmp%2Fproject"],
  ]);
});

import { expect, vi, test } from "vitest";

const handlers = new Map();
const controllerCalls = [];
const browserImportCalls = [];
const mainWindowCalls = [];

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    on: (channel, handler) => {
      handlers.set(channel, handler);
    },
  },
  app: {
    getPath: () => "/tmp/devspace-test",
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
  shell: {
    openExternal: () => {},
  },
  Menu: {
    buildFromTemplate: () => ({ popup: () => {} }),
  },
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- empty mock
  BrowserWindow: class {},
}));

const { registerIpcHandlers } = await import("../ipc-handlers");

registerIpcHandlers(
  {
    webContents: { send: () => {} },
    contentView: {
      children: [
        {
          webContents: { id: 17 },
          getBounds: () => ({ x: 24, y: 44, width: 900, height: 700 }),
        },
      ],
    },
    on: () => {},
    minimize: () => {},
    isMaximized: () => false,
    unmaximize: () => {},
    maximize: () => {},
    setWindowButtonPosition: (position) => {
      mainWindowCalls.push(["setWindowButtonPosition", position]);
    },
    close: () => {},
  },
  {
    createSurface: () => {},
    destroySurface: () => {},
    showSurface: () => {},
    hideSurface: () => {},
    focusSurface: () => {},
    setBounds: () => {},
    onTitleChanged: () => {},
    onSurfaceClosed: () => {},
    onSurfaceFocused: () => {},
    onPwdChanged: () => {},
    onSearchStart: () => {},
    onSearchEnd: () => {},
    onSearchTotal: () => {},
    onSearchSelected: () => {},
    destroyAll: () => {},
  },
  {
    createPane: (paneId, url) => {
      controllerCalls.push(["createPane", paneId, url]);
    },
    destroyPane: () => {},
    showPane: () => {},
    hidePane: () => {},
    getRuntimeState: () => undefined,
    navigate: (paneId, url) => {
      controllerCalls.push(["navigate", paneId, url]);
    },
    back: () => {},
    forward: () => {},
    reload: () => {},
    stop: () => {},
    setBounds: (paneId, bounds) => {
      controllerCalls.push(["setBounds", paneId, bounds]);
    },
    focusPane: () => {},
    setZoom: () => {},
    resetZoom: () => {},
    findInPage: () => {},
    stopFindInPage: () => {},
    toggleDevTools: () => {},
    showContextMenu: () => {},
    resolvePermission: (requestToken, decision) => {
      controllerCalls.push(["resolvePermission", requestToken, decision]);
    },
  },
  {
    isAvailable: () => false,
    start: async () => ({ error: "test" }),
    release: () => {},
    stopAll: () => {},
  },
  {
    isAvailable: () => false,
    start: async () => ({ error: "test" }),
    release: () => {},
    stopAll: () => {},
  },
  {
    listProfiles: async (browser) => {
      if (browser === "chrome") {
        return [{ name: "Profile 1", path: "/tmp/Profile 1", browser: "chrome" }];
      }
      return [];
    },
    importBrowser: async (browser, profilePath, mode) => {
      browserImportCalls.push(["importBrowser", browser, profilePath, mode]);
      return { ok: true, importedCookies: 0, importedHistory: 0 };
    },
    detectAccess: async () => ({ ok: true }),
    clearBrowsingData: async () => ({ ok: true }),
  },
);

test("browser resolvePermission IPC accepts spec permission choices", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:resolvePermission")({}, "token-1", "allow-once");

  expect(controllerCalls).toEqual([["resolvePermission", "token-1", "allow-once"]]);
});

test("browser create IPC only forwards allowlisted URLs", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:create")({}, "pane-1", "https://example.com");
  await handlers.get("browser:create")({}, "pane-2", "javascript:alert(1)");

  expect(controllerCalls).toEqual([["createPane", "pane-1", "https://example.com/"]]);
});

test("browser navigate IPC rejects unsupported URL schemes", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:navigate")({}, "pane-1", "about:blank");
  await handlers.get("browser:navigate")({}, "pane-1", "file:///etc/passwd");

  expect(controllerCalls).toEqual([["navigate", "pane-1", "about:blank"]]);
});

test("browser setBounds translates renderer viewport bounds into contentView coordinates", async () => {
  controllerCalls.length = 0;

  await handlers.get("browser:setBounds")(
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

  await handlers.get("browser:import")({}, "chrome", "/tmp/Profile 1", "history");
  await handlers.get("browser:import")({}, "safari", null, "cookies");

  expect(browserImportCalls).toEqual([
    ["importBrowser", "chrome", "/tmp/Profile 1", "history"],
    ["importBrowser", "safari", null, "cookies"],
  ]);
});

test("browser import IPC rejects profile paths outside discovered profiles", async () => {
  browserImportCalls.length = 0;

  const result = await handlers.get("browser:import")(
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
  const result = await handlers.get("browser:clearData")({}, "everything");

  expect(result).toEqual({ ok: true });
});

test("browser clearData IPC rejects invalid target", async () => {
  const result = await handlers.get("browser:clearData")({}, "invalid");

  expect(result).toEqual({ ok: false, error: "Invalid clear data target." });
});

test("browser detectAccess IPC returns ok for non-Safari browsers", async () => {
  const result = await handlers.get("browser:detectAccess")({}, "chrome");

  expect(result).toEqual({ ok: true });
});

test("browser import IPC rejects invalid browser source", async () => {
  const result = await handlers.get("browser:import")({}, "invalid-browser", null, "everything");

  expect(result).toEqual({
    ok: false,
    code: "INVALID_BROWSER_IMPORT_SOURCE",
    importedCookies: 0,
    importedHistory: 0,
  });
});

test("browser import IPC rejects invalid import mode", async () => {
  const result = await handlers.get("browser:import")({}, "safari", null, "invalid-mode");

  expect(result).toEqual({
    ok: false,
    code: "INVALID_BROWSER_IMPORT_MODE",
    importedCookies: 0,
    importedHistory: 0,
  });
});

test("window setSidebarOpen IPC updates native traffic light position", async () => {
  mainWindowCalls.length = 0;

  await handlers.get("window:setSidebarOpen")({}, false);
  await handlers.get("window:setSidebarOpen")({}, true);

  expect(mainWindowCalls).toEqual([
    ["setWindowButtonPosition", { x: 16, y: 6 }],
    ["setWindowButtonPosition", { x: 16, y: 18 }],
  ]);
});

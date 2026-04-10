import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type LoadIndexOptions = {
  isDev?: boolean;
  vscodeStopAll?: () => Promise<void>;
  t3codeStopAll?: () => Promise<void>;
};

type MockWindow = {
  options: Record<string, unknown>;
  eventHandlers: Map<string, () => void>;
  contentView: {
    addChildView: ReturnType<typeof vi.fn>;
    removeChildView: ReturnType<typeof vi.fn>;
  };
  webContents: {
    send: ReturnType<typeof vi.fn>;
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function loadIndexModule(options: LoadIndexOptions = {}) {
  vi.resetModules();

  const originalNodeEnv = process.env.NODE_ENV;
  const originalRendererUrl = process.env.ELECTRON_RENDERER_URL;
  process.env.NODE_ENV = options.isDev ? "development" : "test";
  delete process.env.ELECTRON_RENDERER_URL;

  const appHandlers = new Map<string, (...args: unknown[]) => void>();
  const windowInstances: MockWindow[] = [];
  const setApplicationMenu = vi.fn();
  const buildFromTemplate = vi.fn((template) => ({ template }));
  const mkdirSync = vi.fn();
  const writeFileSync = vi.fn();
  const listen = vi.fn((_port: number, _host: string, onListening?: () => void) => {
    onListening?.();
  });
  const close = vi.fn();
  const serverOn = vi.fn();
  const syncShellEnvironment = vi.fn();
  const registerIpcHandlers = vi.fn();
  const installWindowZoomReset = vi.fn();
  const terminalManager = {
    init: vi.fn(),
    setReservedShortcuts: vi.fn(),
    destroyAll: vi.fn(),
  };
  const vscodeServerManager = {
    stopAll: vi.fn(options.vscodeStopAll ?? (() => Promise.resolve())),
  };
  const t3codeServerManager = {
    stopAll: vi.fn(options.t3codeStopAll ?? (() => Promise.resolve())),
  };
  const browserSessionManager = {
    installHandlers: vi.fn(),
    getSession: vi.fn(() => ({ partition: "persist:test-browser" })),
  };
  const browserPaneManager = {
    resolvePaneIdForWebContents: vi.fn(),
    requestPermission: vi.fn(),
    reportFailure: vi.fn(),
  };
  const browserHistoryService = { kind: "history-service" };
  const browserImportService = { kind: "import-service" };
  const shortcutStore = {
    registerIpcHandlers: vi.fn(),
    getAllOverrides: vi.fn(() => new Map()),
    onChange: vi.fn(),
  };
  const getAllNativeBridgeShortcuts = vi.fn(() => ["CmdOrCtrl+1"]);

  class TerminalManagerMock {
    init = terminalManager.init;
    setReservedShortcuts = terminalManager.setReservedShortcuts;
    destroyAll = terminalManager.destroyAll;
  }

  class VscodeServerManagerMock {
    stopAll = vscodeServerManager.stopAll;
  }

  class T3CodeServerManagerMock {
    stopAll = t3codeServerManager.stopAll;
  }

  class BrowserSessionManagerMock {
    installHandlers = browserSessionManager.installHandlers;
    getSession = browserSessionManager.getSession;
  }

  class BrowserPaneManagerMock {
    resolvePaneIdForWebContents = browserPaneManager.resolvePaneIdForWebContents;
    requestPermission = browserPaneManager.requestPermission;
    reportFailure = browserPaneManager.reportFailure;
  }

  class BrowserHistoryServiceMock {
    kind = browserHistoryService.kind;
  }

  class BrowserImportServiceMock {
    kind = browserImportService.kind;
  }

  class ShortcutStoreMock {
    registerIpcHandlers = shortcutStore.registerIpcHandlers;
    getAllOverrides = shortcutStore.getAllOverrides;
    onChange = shortcutStore.onChange;
  }

  class BrowserWindowMock {
    static getAllWindows = vi.fn(() => windowInstances);
    static getFocusedWindow = vi.fn(() => windowInstances[0] ?? null);

    options: Record<string, unknown>;
    eventHandlers = new Map<string, () => void>();
    contentView = {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    };
    webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    loadFile = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = vi.fn(() => false);

    constructor(windowOptions: Record<string, unknown>) {
      this.options = windowOptions;
      windowInstances.push(this as unknown as MockWindow);
    }

    on = vi.fn((event: string, handler: () => void) => {
      this.eventHandlers.set(event, handler);
      return this;
    });
  }

  const app = {
    name: "Devspace",
    isPackaged: false,
    setName: vi.fn(),
    setPath: vi.fn(),
    getPath: vi.fn((name: string) => {
      if (name === "appData") return "/tmp/app-data";
      return "/tmp/devspace";
    }),
    getAppPath: vi.fn(() => "/Applications/Devspace.app/Contents/Resources/app"),
    whenReady: vi.fn(() => Promise.resolve()),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      appHandlers.set(event, handler);
      return app;
    }),
  };

  vi.spyOn(process, "on").mockImplementation((() => process) as typeof process.on);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  vi.doMock("electron", () => ({
    app,
    BrowserWindow: BrowserWindowMock,
    Menu: {
      buildFromTemplate,
      setApplicationMenu,
    },
  }));
  vi.doMock("http", () => ({
    createServer: vi.fn(() => ({
      on: serverOn,
      listen,
      close,
    })),
  }));
  vi.doMock("fs", () => ({
    existsSync: vi.fn(() => false),
    statSync: vi.fn(),
    writeFileSync,
    mkdirSync,
  }));
  vi.doMock("crypto", () => ({
    randomBytes: vi.fn(() => Buffer.from("token")),
  }));
  vi.doMock("../shell-env", () => ({
    syncShellEnvironment,
  }));
  vi.doMock("../terminal-manager", () => ({
    TerminalManager: TerminalManagerMock,
  }));
  vi.doMock("../vscode-server", () => ({
    VscodeServerManager: VscodeServerManagerMock,
  }));
  vi.doMock("../t3code-server", () => ({
    T3CodeServerManager: T3CodeServerManagerMock,
  }));
  vi.doMock("../ipc-handlers", () => ({
    registerIpcHandlers,
  }));
  vi.doMock("../browser/browser-session-manager", () => ({
    BrowserSessionManager: BrowserSessionManagerMock,
  }));
  vi.doMock("../browser/browser-pane-manager", () => ({
    BrowserPaneManager: BrowserPaneManagerMock,
  }));
  vi.doMock("../browser/browser-history-service", () => ({
    BrowserHistoryService: BrowserHistoryServiceMock,
  }));
  vi.doMock("../browser/browser-import-service", () => ({
    BrowserImportService: BrowserImportServiceMock,
  }));
  vi.doMock("../window-zoom", () => ({
    installWindowZoomReset,
  }));
  vi.doMock("../window-chrome", () => ({
    getTrafficLightPosition: vi.fn(() => ({ x: 16, y: 18 })),
  }));
  vi.doMock("../dev-mode", () => ({
    IS_DEV: options.isDev ?? false,
    CLI_PORT: 21549,
    EDITOR_PARTITION: "persist:test-editor",
  }));
  vi.doMock("../shortcut-store", () => ({
    ShortcutStore: ShortcutStoreMock,
  }));
  vi.doMock("../../shared/shortcuts", () => ({
    DEFAULT_SHORTCUTS: [],
    getAllNativeBridgeShortcuts,
    resolveShortcut: vi.fn(),
    toElectronAccelerator: vi.fn(() => undefined),
  }));

  await import("../index");
  await Promise.resolve();

  return {
    app,
    appHandlers,
    browserSessionManager,
    browserPaneManager,
    browserImportService,
    buildFromTemplate,
    close,
    getAllNativeBridgeShortcuts,
    installWindowZoomReset,
    listen,
    mkdirSync,
    registerIpcHandlers,
    setApplicationMenu,
    shortcutStore,
    syncShellEnvironment,
    t3codeServerManager,
    terminalManager,
    vscodeServerManager,
    windowInstances,
    writeFileSync,
    restoreEnvironment: () => {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalRendererUrl === undefined) {
        delete process.env.ELECTRON_RENDERER_URL;
      } else {
        process.env.ELECTRON_RENDERER_URL = originalRendererUrl;
      }
    },
  };
}

describe("main/index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the CLI token, creates a secured window, and wires window lifecycle events", async () => {
    const ctx = await loadIndexModule();

    expect(ctx.syncShellEnvironment).toHaveBeenCalledTimes(1);
    expect(ctx.mkdirSync).toHaveBeenCalledWith("/tmp/devspace/cli", { recursive: true });
    expect(ctx.writeFileSync).toHaveBeenCalledWith("/tmp/devspace/cli/token.21549", "746f6b656e", {
      mode: 0o600,
    });
    expect(ctx.listen).toHaveBeenCalledWith(21549, "127.0.0.1", expect.any(Function));

    expect(ctx.windowInstances).toHaveLength(1);
    const mainWindow = ctx.windowInstances[0];
    expect(mainWindow).toBeTruthy();
    if (!mainWindow) {
      throw new Error("expected startup to create a main window");
    }

    expect(mainWindow.options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
    });
    expect(mainWindow.loadFile).toHaveBeenCalledWith(
      expect.stringContaining("renderer/index.html"),
    );

    const denyNewWindow = mainWindow.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      | (() => { action: string })
      | undefined;
    expect(denyNewWindow?.()).toEqual({ action: "deny" });

    mainWindow.eventHandlers.get("ready-to-show")?.();
    mainWindow.eventHandlers.get("focus")?.();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith("window:focus");

    expect(ctx.terminalManager.init).toHaveBeenCalledWith(mainWindow);
    expect(ctx.registerIpcHandlers).toHaveBeenCalledTimes(1);
    expect(ctx.installWindowZoomReset).toHaveBeenCalledWith(mainWindow.webContents);
    expect(ctx.terminalManager.setReservedShortcuts).toHaveBeenCalledWith(["CmdOrCtrl+1"]);
    expect(ctx.setApplicationMenu).toHaveBeenCalledTimes(1);

    ctx.restoreEnvironment();
  });

  it("creates a new window on activate when all windows are closed", async () => {
    const ctx = await loadIndexModule();

    const activateHandler = ctx.appHandlers.get("activate");
    expect(activateHandler).toBeTypeOf("function");

    activateHandler?.();
    expect(ctx.windowInstances).toHaveLength(1);

    ctx.windowInstances.length = 0;
    activateHandler?.();
    expect(ctx.windowInstances).toHaveLength(1);

    ctx.restoreEnvironment();
  });

  it("waits for background services to stop before quitting", async () => {
    const vscodeStop = createDeferred();
    const t3codeStop = createDeferred();
    const ctx = await loadIndexModule({
      vscodeStopAll: () => vscodeStop.promise,
      t3codeStopAll: () => t3codeStop.promise,
    });

    const beforeQuitHandler = ctx.appHandlers.get("before-quit");
    expect(beforeQuitHandler).toBeTypeOf("function");

    const event = { preventDefault: vi.fn() };
    beforeQuitHandler?.(event);

    expect(ctx.terminalManager.destroyAll).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(ctx.vscodeServerManager.stopAll).toHaveBeenCalledTimes(1);
    expect(ctx.t3codeServerManager.stopAll).toHaveBeenCalledTimes(1);
    expect(ctx.app.quit).not.toHaveBeenCalled();

    vscodeStop.resolve();
    await Promise.resolve();
    expect(ctx.app.quit).not.toHaveBeenCalled();

    t3codeStop.resolve();
    await Promise.all([vscodeStop.promise, t3codeStop.promise]);
    await Promise.resolve();
    expect(ctx.app.quit).toHaveBeenCalledTimes(1);

    ctx.restoreEnvironment();
  });
});

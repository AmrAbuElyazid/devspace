import { app, BrowserWindow, screen } from "electron";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { createCliHttpServer, writeCliAuthTokenFile } from "./cli-server";
import { configureGhosttyEnvironment } from "./ghostty-env";
import { buildAppShortcutBindings } from "./app-shortcut-bindings";
import { syncShellEnvironment } from "./shell-env";
import { TerminalManager } from "./terminal-manager";
import { VscodeServerManager } from "./vscode-server";
import { T3CodeServerManager } from "./t3code-server";
import { registerIpcHandlers } from "./ipc-handlers";
import { PaneOverlayManager } from "./browser/pane-overlay-manager";
import { SidebarPeekWatcher } from "./sidebar-peek-watcher";
import { trustIpcWebContents } from "./ipc/shared";
import { BrowserSessionManager } from "./browser/browser-session-manager";
import { BrowserPaneManager } from "./browser/browser-pane-manager";
import { BrowserHistoryService } from "./browser/browser-history-service";
import { BrowserImportService } from "./browser/browser-import-service";
import { installWindowZoomReset } from "./window-zoom";
import { DEFAULT_TITLE_BAR_HEIGHT, getTrafficLightPosition } from "./window-chrome";
import { installDynamicAppMenu } from "./app-menu";
import { AppUpdater } from "./app-updater";
import { IS_DEV, CLI_PORT, EDITOR_PARTITION } from "./dev-mode";
import { ShortcutStore } from "./shortcut-store";
import { installNoteAssetProtocol, registerNoteAssetScheme } from "./note-asset-protocol";

// Keep the same userData path as before the monorepo conversion.
// Without this, Electron derives the path from package.json "name" (@devspace/desktop)
// which would lose existing user data (shortcuts, browser history, etc.).
app.setName("devspace");

const overriddenUserDataPath = process.env.DEVSPACE_USER_DATA_PATH?.trim();

function configureStoragePaths(userDataPath: string): void {
  const sessionDataPath = join(userDataPath, "session-data");
  mkdirSync(sessionDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
  app.setPath("sessionData", sessionDataPath);
}

if (overriddenUserDataPath) {
  configureStoragePaths(overriddenUserDataPath);
} else if (IS_DEV) {
  const devUserDataPath = join(app.getPath("appData"), "devspace-dev");
  configureStoragePaths(devUserDataPath);
}

// Sync shell environment before app is ready (macOS GUI apps don't inherit login shell env)
syncShellEnvironment();

// Privileged schemes have to be declared before the app is ready; the handler
// itself is installed in whenReady below.
registerNoteAssetScheme();

// ---------------------------------------------------------------------------
// CLI HTTP server — `devspace .` sends a request here
// ---------------------------------------------------------------------------

/** Random auth token for the CLI HTTP server. Written to a file that the CLI script reads. */
const cliAuthToken = randomBytes(32).toString("hex");

let mainWindow: BrowserWindow | null = null;
function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function sendOpenEditor(folderPath: string): void {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send("open-editor", folderPath);
}

const cliHttpServer = createCliHttpServer({
  port: CLI_PORT,
  authToken: cliAuthToken,
  onOpenEditor: sendOpenEditor,
});

// ---------------------------------------------------------------------------
// Single-instance lock (production only)
// ---------------------------------------------------------------------------

if (!IS_DEV && process.env.DEVSPACE_DISABLE_SINGLE_INSTANCE_LOCK !== "1") {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
  }
}

const terminalManager = new TerminalManager();
let vscodeServerManager: VscodeServerManager;
let t3codeServerManager: T3CodeServerManager;
let shortcutStore: ShortcutStore | null = null;
const appUpdater = new AppUpdater({
  isDevelopment: IS_DEV,
  getWindow: () => getMainWindow(),
});
const browserSessionManager = new BrowserSessionManager();
const editorSessionManager = new BrowserSessionManager(undefined, EDITOR_PARTITION, {
  persistSessionCookies: false,
});

function getTrustedDevRendererUrl(): string | null {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL?.trim();
  if (!rendererUrl || !IS_DEV) return null;

  try {
    const url = new URL(rendererUrl);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    return isLocalHost && isHttp ? url.toString() : null;
  } catch {
    return null;
  }
}

// Global error handlers
process.on("uncaughtException", (error) => {
  console.error("[main] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled rejection:", reason);
});

function createWindow(): void {
  const browserHistoryService = new BrowserHistoryService({
    appDataPath: app.getPath("userData"),
  });
  const browserImportService = new BrowserImportService({
    sessionManager: browserSessionManager,
    historyService: browserHistoryService,
  });
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: getTrafficLightPosition(DEFAULT_TITLE_BAR_HEIGHT),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
    },
  });

  // Deny all new window requests
  window.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  const browserPaneManager = new BrowserPaneManager({
    addChildView: (view) => window.contentView.addChildView(view),
    removeChildView: (view) => window.contentView.removeChildView(view),
    sendToRenderer: (channel, ...args) => window.webContents.send(channel, ...args),
    getAppShortcutBindings: () => buildAppShortcutBindings(shortcutStore),
    getSession: (kind) =>
      kind === "editor" ? editorSessionManager.getSession() : browserSessionManager.getSession(),
    historyService: browserHistoryService,
    isWindowFocused: () => !window.isDestroyed() && window.isFocused(),
  });

  browserSessionManager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) =>
      browserPaneManager.resolvePaneIdForWebContents(webContentsId),
    requestBrowserPermission: (request, resolve) => {
      browserPaneManager.requestPermission(request, resolve);
    },
    reportCertificateError: (paneId, url) => {
      browserPaneManager.reportFailure(
        paneId,
        {
          kind: "navigation",
          detail: "Certificate error",
          url,
        },
        {
          title: "Certificate error",
          isSecure: false,
          securityLabel: "Certificate error",
        },
      );
    },
  });

  configureGhosttyEnvironment({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    moduleDir: __dirname,
  });

  terminalManager.init(window);
  const paneOverlayManager = new PaneOverlayManager({
    getWindow: () => (window.isDestroyed() ? null : window),
    // A child window rather than a child view: Ghostty's terminal surface is
    // attached to the AppKit content view above Electron's whole view tree, so
    // only a separate window can draw over it.
    createSurface: () =>
      new BrowserWindow({
        parent: window,
        frame: false,
        transparent: true,
        hasShadow: false,
        roundedCorners: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        // The surface is shown without focus, so without this macOS would spend
        // the first click activating the window instead of delivering it — a
        // hover panel the user has to click twice is a broken hover panel.
        acceptFirstMouse: true,
        backgroundColor: "#00000000",
        webPreferences: {
          preload: join(__dirname, "../preload/index.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      }),
    loadOverlay: (surface) => {
      // The overlay sends IPC back, so it has to be on the trusted list.
      trustIpcWebContents(surface.webContents);
      const devUrl = getTrustedDevRendererUrl();
      if (devUrl) {
        void surface.loadURL(`${devUrl}#overlay`);
      } else {
        void surface.loadFile(join(__dirname, "../renderer/index.html"), { hash: "overlay" });
      }
    },
  });

  // Watches for the cursor reaching the left edge while the sidebar is
  // collapsed. It has to live out here: the collapsed sidebar leaves the
  // renderer a couple of pixels of window it can still see mouse events in,
  // and the native panes swallow the rest.
  const sidebarPeekWatcher = new SidebarPeekWatcher({
    getContentBounds: () => (window.isDestroyed() ? null : window.getContentBounds()),
    getCursorPoint: () => screen.getCursorScreenPoint(),
    isWindowFocused: () => !window.isDestroyed() && window.isFocused(),
    show: (rect, config) => void paneOverlayManager.showPeek(rect, config.snapshot),
    hide: () => paneOverlayManager.hidePeek(),
  });
  window.on("focus", () => sidebarPeekWatcher.setWindowFocused(true));
  window.on("blur", () => sidebarPeekWatcher.setWindowFocused(false));

  window.on("closed", () => {
    sidebarPeekWatcher.dispose();
    paneOverlayManager.destroy();
  });

  registerIpcHandlers(
    window,
    terminalManager,
    browserPaneManager,
    vscodeServerManager,
    t3codeServerManager,
    browserImportService,
    editorSessionManager,
    browserSessionManager,
    appUpdater,
    paneOverlayManager,
    sidebarPeekWatcher,
  );
  installWindowZoomReset(window.webContents);

  window.on("ready-to-show", () => {
    window.show();
  });

  // Notify renderer when the window regains focus so it can re-focus
  // the active terminal surface (macOS restores focus to the web content
  // view, not the previously-focused GhosttyView).
  window.on("focus", () => {
    window.webContents.send("window:focus");
  });

  // Store reference for single-instance lock handler
  mainWindow = window;

  const trustedDevRendererUrl = getTrustedDevRendererUrl();
  if (trustedDevRendererUrl) {
    window.loadURL(trustedDevRendererUrl);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  installNoteAssetProtocol();

  // Start the CLI HTTP server only after the single-instance lock succeeds
  // (whenReady won't fire for the second instance since app.quit() was called).
  cliHttpServer.listen(CLI_PORT, "127.0.0.1", () => {
    // Written here rather than before the bind, and only once the bind has
    // actually succeeded. The token file names the port, so an instance that
    // lost the race for it used to overwrite the file with a token for a
    // server it does not own — pointing `devspace .` at the other instance
    // with credentials it will reject. File permissions restrict it to the
    // current user; the filename includes the port so dev and production do
    // not collide.
    writeCliAuthTokenFile(app.getPath("userData"), CLI_PORT, cliAuthToken);
    console.log(`[cli] listening on http://127.0.0.1:${CLI_PORT}`);
  });

  vscodeServerManager = new VscodeServerManager();
  t3codeServerManager = new T3CodeServerManager();

  // Session-level setup (cookie persistence, CORS overrides, secret key
  // handler) is now deferred — BrowserSessionManager.getSession() installs
  // all handlers lazily on first access.  This avoids triggering the macOS
  // Keychain prompt at startup; the "devspace Safe Storage" prompt will only
  // appear when the user first opens a browser or editor pane.

  // Initialize shortcut store and register IPC handlers
  const activeShortcutStore = (shortcutStore = new ShortcutStore());
  activeShortcutStore.registerIpcHandlers();

  createWindow();

  // ── Dynamic application menu ──────────────────────────────────────────
  // Built from the shortcut registry so accelerators stay in sync with
  // user customizations. Rebuilt whenever shortcuts change.
  installDynamicAppMenu(activeShortcutStore, terminalManager, appUpdater);
  appUpdater.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

let isQuitting = false;
app.on("before-quit", (event) => {
  terminalManager.destroyAll();
  if (isQuitting) return; // already shutting down, let quit proceed
  isQuitting = true;
  cliHttpServer.close();
  // stopAll() is async — prevent immediate quit, wait for graceful
  // shutdown, then re-trigger quit.
  event.preventDefault();
  Promise.all([vscodeServerManager.stopAll(), t3codeServerManager.stopAll()]).finally(() => {
    app.quit();
  });
});

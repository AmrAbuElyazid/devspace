import { app, BrowserWindow } from "electron";
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
import { BrowserSessionManager } from "./browser/browser-session-manager";
import { BrowserPaneManager } from "./browser/browser-pane-manager";
import { BrowserHistoryService } from "./browser/browser-history-service";
import { BrowserImportService } from "./browser/browser-import-service";
import { installWindowZoomReset } from "./window-zoom";
import { getTrafficLightPosition } from "./window-chrome";
import { installDynamicAppMenu } from "./app-menu";
import { AppUpdater } from "./app-updater";
import { IS_DEV, CLI_PORT, EDITOR_PARTITION } from "./dev-mode";
import { ShortcutStore } from "./shortcut-store";

// Keep the same userData path as before the monorepo conversion.
// Without this, Electron derives the path from package.json "name" (@devspace/desktop)
// which would lose existing user data (shortcuts, browser history, etc.).
app.setName("devspace");

if (IS_DEV) {
  const devUserDataPath = join(app.getPath("appData"), "devspace-dev");
  app.setPath("userData", devUserDataPath);
  app.setPath("sessionData", join(devUserDataPath, "session-data"));
}

// Sync shell environment before app is ready (macOS GUI apps don't inherit login shell env)
syncShellEnvironment();

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

if (!IS_DEV) {
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
    trafficLightPosition: getTrafficLightPosition(true),
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

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Write the auth token to a file so the CLI script can read it.
  // File permissions restrict access to the current user.
  // The filename includes the port so dev and production don't collide.
  writeCliAuthTokenFile(app.getPath("userData"), CLI_PORT, cliAuthToken);

  // Start the CLI HTTP server only after the single-instance lock succeeds
  // (whenReady won't fire for the second instance since app.quit() was called).
  cliHttpServer.listen(CLI_PORT, "127.0.0.1", () => {
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

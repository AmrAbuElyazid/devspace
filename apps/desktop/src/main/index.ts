import { app, BrowserWindow } from "electron";
import { createServer as createHttpServer } from "http";
import { join } from "path";
import { existsSync, statSync, writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
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
import { IS_DEV, CLI_PORT, EDITOR_PARTITION } from "./dev-mode";
import { resolveDevelopmentPath } from "./dev-paths";
import { ShortcutStore } from "./shortcut-store";
import { DEFAULT_SHORTCUTS, resolveShortcut } from "../shared/shortcuts";

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

const cliHttpServer = createHttpServer((req, res) => {
  if (!req.url) {
    res.writeHead(404).end();
    return;
  }

  // Validate auth token — reject requests without a valid token
  const token = req.headers["x-devspace-token"];
  if (token !== cliAuthToken) {
    res.writeHead(403).end("forbidden");
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${CLI_PORT}`);

  if (url.pathname === "/open-editor") {
    const folderPath = url.searchParams.get("path");
    try {
      if (folderPath && statSync(folderPath).isDirectory()) {
        sendOpenEditor(folderPath);
        res.writeHead(200).end("ok");
      } else {
        res.writeHead(400).end("invalid path");
      }
    } catch (err) {
      console.warn("[main] Path validation failed:", err);
      res.writeHead(400).end("invalid path");
    }
    return;
  }

  res.writeHead(404).end();
});

cliHttpServer.on("error", (err) => {
  console.error(`[cli] HTTP server error:`, err);
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
    getAppShortcutBindings: () => {
      if (!shortcutStore) {
        return [];
      }
      const overrides = shortcutStore.getAllOverrides();
      return DEFAULT_SHORTCUTS.map((def) =>
        def.numbered
          ? {
              action: def.action,
              channel: def.ipcChannel,
              shortcut: resolveShortcut(def.action, overrides),
              args: [parseInt(def.action.slice(-1), 10)],
            }
          : {
              action: def.action,
              channel: def.ipcChannel,
              shortcut: resolveShortcut(def.action, overrides),
            },
      );
    },
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

  // Set up Ghostty resources before initializing the terminal bridge.
  // GHOSTTY_RESOURCES_DIR: tells libghostty where shell integration scripts live.
  // Terminfo is stored OUTSIDE GHOSTTY_RESOURCES_DIR to prevent the native bridge
  // from forcing TERM=xterm-ghostty (which causes display issues). TERMINFO is set
  // separately so the xterm-ghostty entry is available if libghostty requests it.
  if (!process.env.GHOSTTY_RESOURCES_DIR) {
    const bundledResources = app.isPackaged
      ? join(process.resourcesPath, "ghostty")
      : resolveDevelopmentPath("packages/ghostty-electron/deps/libghostty/share/ghostty", {
          appPath: app.getAppPath(),
          cwd: process.cwd(),
          moduleDir: __dirname,
        });
    if (existsSync(bundledResources)) {
      process.env.GHOSTTY_RESOURCES_DIR = bundledResources;
    }
  }
  if (!process.env.TERMINFO) {
    const terminfoDir = app.isPackaged
      ? join(process.resourcesPath, "terminfo")
      : resolveDevelopmentPath("packages/ghostty-electron/deps/libghostty/share/terminfo", {
          appPath: app.getAppPath(),
          cwd: process.cwd(),
          moduleDir: __dirname,
        });
    if (existsSync(terminfoDir)) {
      process.env.TERMINFO = terminfoDir;
    }
  }

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
  const tokenDir = join(app.getPath("userData"), "cli");
  mkdirSync(tokenDir, { recursive: true });
  const tokenPath = join(tokenDir, `token.${CLI_PORT}`);
  writeFileSync(tokenPath, cliAuthToken, { mode: 0o600 });

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
  installDynamicAppMenu(activeShortcutStore, terminalManager);

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

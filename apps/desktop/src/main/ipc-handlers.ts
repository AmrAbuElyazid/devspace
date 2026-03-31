import { ipcMain, app, dialog, shell, BrowserWindow, Menu } from "electron";
import { readFile, writeFile, mkdir, readdir, rename } from "fs/promises";
import { existsSync, unlinkSync, symlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import type { TerminalManager } from "./terminal-manager";
import type { VscodeServerManager } from "./vscode-server";
import type { T3CodeServerManager } from "./t3code-server";
import type {
  BrowserBounds,
  BrowserFindInPageOptions,
  BrowserImportMode,
  BrowserPermissionDecision,
  BrowserStopFindAction,
} from "../shared/browser";
import type { BrowserPaneController } from "./browser/browser-types";
import type { BrowserImportService } from "./browser/browser-import-service";
import type { BrowserSessionManager } from "./browser/browser-session-manager";
import {
  findHostViewBounds,
  translateRendererBoundsToContentBounds,
} from "./browser/browser-view-bounds";
import { validateFilePath, getSafeExternalUrl } from "./validation";
import { getTrafficLightPosition } from "./window-chrome";

const registeredHandlers = new Set<string>();

function safeHandle(channel: string, handler: (event: any, ...args: any[]) => any) {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.handle(channel, handler);
}

function safeOn(channel: string, handler: (event: any, ...args: any[]) => void) {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.on(channel, handler);
}

/** Escape a string for embedding in an AppleScript double-quoted literal. */
const escAS = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function parseBrowserImportMode(mode: unknown): BrowserImportMode | null {
  if (mode === undefined) return "everything";
  if (mode === "cookies" || mode === "history" || mode === "everything") return mode;
  return null;
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  terminalManager: TerminalManager,
  browserPaneManager: BrowserPaneController,
  vscodeServerManager: VscodeServerManager,
  t3codeServerManager: T3CodeServerManager,
  browserImportService?: BrowserImportService,
  _browserSessionManager?: BrowserSessionManager,
): void {
  const allowedRoots = [homedir()];

  // --- Terminal handlers ---

  safeHandle("terminal:create", (_event, surfaceId: unknown, options: unknown) => {
    if (typeof surfaceId !== "string") return;
    const opts =
      typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
    const cwd = typeof opts["cwd"] === "string" ? opts["cwd"] : undefined;
    // Extract env vars (Record<string, string>)
    let envVars: Record<string, string> | undefined;
    if (typeof opts["envVars"] === "object" && opts["envVars"] !== null) {
      const raw = opts["envVars"] as Record<string, unknown>;
      envVars = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") envVars[k] = v;
      }
      if (Object.keys(envVars).length === 0) envVars = undefined;
    }
    const createOpts: { cwd?: string; envVars?: Record<string, string> } = {};
    if (cwd) createOpts.cwd = cwd;
    if (envVars) createOpts.envVars = envVars;
    terminalManager.createSurface(
      surfaceId,
      Object.keys(createOpts).length > 0 ? createOpts : undefined,
    );
  });

  safeHandle("terminal:destroy", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.destroySurface(surfaceId);
  });

  safeHandle("terminal:show", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.showSurface(surfaceId);
  });

  safeHandle("terminal:hide", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.hideSurface(surfaceId);
  });

  safeHandle("terminal:focus", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.focusSurface(surfaceId);
  });

  safeHandle("terminal:setVisibleSurfaces", (_event, surfaceIds: unknown) => {
    if (!Array.isArray(surfaceIds)) return;
    const valid = surfaceIds.filter((id): id is string => typeof id === "string");
    terminalManager.setVisibleSurfaces(valid);
  });

  safeHandle("terminal:blur", (event) => {
    terminalManager.blurSurfaces();
    // After native surfaces resign first responder, explicitly focus the web
    // content so keyboard events flow to the renderer's DOM. Without this,
    // keystrokes reach the BrowserWindow but not the web content, causing
    // macOS to beep (no responder handles the event).
    event.sender.focus();
  });

  safeHandle("terminal:sendBindingAction", (_event, surfaceId: unknown, action: unknown) => {
    if (typeof surfaceId !== "string" || typeof action !== "string") return false;
    return terminalManager.sendBindingAction(surfaceId, action);
  });

  safeHandle("terminal:setBounds", (_event, surfaceId: unknown, bounds: unknown) => {
    if (typeof surfaceId !== "string" || typeof bounds !== "object" || bounds === null) return;
    const b = bounds as Partial<{ x: number; y: number; width: number; height: number }>;
    if (
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.width !== "number" ||
      typeof b.height !== "number"
    ) {
      return;
    }
    terminalManager.setBounds(surfaceId, { x: b.x, y: b.y, width: b.width, height: b.height });
  });

  // --- Editor (VS Code serve-web) handlers ---

  // Track which pane maps to which folder so we can release on stop.
  // Value is the folder path, or undefined for no-folder sessions.
  const editorPaneFolders = new Map<string, string | undefined>();

  safeHandle("editor:isAvailable", () => {
    return vscodeServerManager.isAvailable();
  });

  safeHandle("editor:start", async (_event, paneId: unknown, folderPath: unknown) => {
    if (typeof paneId !== "string") {
      return { error: "Invalid arguments" };
    }
    const folder = typeof folderPath === "string" ? folderPath : undefined;
    try {
      const { url } = await vscodeServerManager.start(folder);
      editorPaneFolders.set(paneId, folder);

      // No need to set the vscode-secret-key-path cookie ourselves — the
      // code serve-web server sets it to /_vscode-cli/mint-key in its HTTP
      // response.  Our protocol handler (registerSecretKeyHandler) intercepts
      // POST requests to that endpoint and returns a stable key instead of
      // the server's ephemeral one.

      browserPaneManager.createPane(paneId, url);
      return { url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  safeHandle("editor:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    if (editorPaneFolders.has(paneId)) {
      const folder = editorPaneFolders.get(paneId);
      editorPaneFolders.delete(paneId);
      vscodeServerManager.release(folder);
    }
    browserPaneManager.destroyPane(paneId);
  });

  safeOn("editor:setKeepServerRunning", (_event, keep: unknown) => {
    if (typeof keep !== "boolean") return;
    vscodeServerManager.keepRunning = keep;
  });

  // --- T3 Code handlers ---

  safeHandle("t3code:isAvailable", () => {
    return t3codeServerManager.isAvailable();
  });

  safeHandle("t3code:start", async (_event, paneId: unknown) => {
    if (typeof paneId !== "string") {
      return { error: "Invalid arguments" };
    }
    try {
      const { url } = await t3codeServerManager.start();
      browserPaneManager.createPane(paneId, url);
      return { url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  safeHandle("t3code:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    t3codeServerManager.release();
    browserPaneManager.destroyPane(paneId);
  });

  // Terminal event forwarding to renderer
  terminalManager.onTitleChanged((surfaceId, title) => {
    mainWindow.webContents.send("terminal:titleChanged", surfaceId, title);
  });

  terminalManager.onSurfaceClosed((surfaceId) => {
    mainWindow.webContents.send("terminal:closed", surfaceId);
  });

  terminalManager.onSurfaceFocused((surfaceId) => {
    mainWindow.webContents.send("terminal:focused", surfaceId);
  });

  terminalManager.onPwdChanged((surfaceId, pwd) => {
    mainWindow.webContents.send("terminal:pwdChanged", surfaceId, pwd);
  });

  terminalManager.onSearchStart((surfaceId, needle) => {
    mainWindow.webContents.send("terminal:searchStart", surfaceId, needle);
  });

  terminalManager.onSearchEnd((surfaceId) => {
    mainWindow.webContents.send("terminal:searchEnd", surfaceId);
  });

  terminalManager.onSearchTotal((surfaceId, total) => {
    mainWindow.webContents.send("terminal:searchTotal", surfaceId, total);
  });

  terminalManager.onSearchSelected((surfaceId, selected) => {
    mainWindow.webContents.send("terminal:searchSelected", surfaceId, selected);
  });

  // --- Window handlers ---

  safeOn("window:minimize", () => {
    mainWindow.minimize();
  });

  safeOn("window:maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  safeOn("window:close", () => {
    mainWindow.close();
  });

  safeOn("window:setSidebarOpen", (_event, open) => {
    if (typeof open !== "boolean") return;
    mainWindow.setWindowButtonPosition(getTrafficLightPosition(open));
  });

  safeHandle("window:isMaximized", () => {
    return mainWindow.isMaximized();
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window:maximizeChange", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window:maximizeChange", false);
  });

  // --- Dialog handlers ---

  safeHandle("dialog:openFile", async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      ...(typeof defaultPath === "string" ? { defaultPath } : {}),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    if (!filePath) {
      return null;
    }
    try {
      const content = await readFile(filePath, "utf-8");
      return { path: filePath, content };
    } catch (err) {
      console.warn("[ipc] File read failed:", err);
      return { error: `Failed to read file: ${filePath}` };
    }
  });

  safeHandle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // --- File system handlers ---

  safeHandle("fs:readFile", async (_event, filePath: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots);
    if (!validPath) {
      return { error: "File path is not allowed" };
    }
    try {
      return await readFile(validPath, "utf-8");
    } catch (err) {
      console.warn("[ipc] fs:readFile failed:", err);
      return { error: `Failed to read file: ${validPath}` };
    }
  });

  safeHandle("fs:writeFile", async (_event, filePath: unknown, content: unknown) => {
    const validPath = validateFilePath(filePath, allowedRoots);
    if (!validPath) {
      return { error: "File path is not allowed" };
    }
    if (typeof content !== "string") {
      return { error: "File content must be a string" };
    }
    try {
      await writeFile(validPath, content, "utf-8");
    } catch (err) {
      console.warn("[ipc] fs:writeFile failed:", err);
      return { error: `Failed to write file: ${validPath}` };
    }
  });

  // --- Notes handlers ---

  const notesDir = join(app.getPath("userData"), "notes");
  /** Only allow alphanumeric, dashes, and underscores in noteId to prevent path traversal. */
  const SAFE_NOTE_ID = /^[\w-]+$/;

  safeHandle("notes:read", async (_event, noteId: unknown) => {
    if (typeof noteId !== "string" || !SAFE_NOTE_ID.test(noteId)) return null;
    const filePath = join(notesDir, `${noteId}.md`);
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  });

  safeHandle("notes:save", async (_event, noteId: unknown, content: unknown) => {
    if (typeof noteId !== "string" || !SAFE_NOTE_ID.test(noteId)) {
      return { error: "Invalid note ID" };
    }
    if (typeof content !== "string") {
      return { error: "Content must be a string" };
    }
    try {
      await mkdir(notesDir, { recursive: true });
      // Atomic write: write to temp file then rename to prevent corruption
      const filePath = join(notesDir, `${noteId}.md`);
      const tmpPath = join(notesDir, `${noteId}.tmp`);
      await writeFile(tmpPath, content, "utf-8");
      await rename(tmpPath, filePath);
    } catch (err) {
      console.error("[notes:save] Failed to save note:", noteId, err);
      return { error: `Failed to save note: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  safeHandle("notes:list", async () => {
    try {
      const files = await readdir(notesDir);
      return files.filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  });

  safeHandle("notes:save", async (_event, noteId: unknown, content: unknown) => {
    if (typeof noteId !== "string" || noteId.length === 0) return;
    if (typeof content !== "string") return;
    await mkdir(notesDir, { recursive: true });
    const filePath = join(notesDir, `${noteId}.json`);
    await writeFile(filePath, content, "utf-8");
  });

  safeHandle("notes:list", async () => {
    try {
      const files = await readdir(notesDir);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  });

  // --- Shell handlers ---

  safeOn("shell:openExternal", (_event, url: unknown) => {
    const safeUrl = getSafeExternalUrl(url);
    if (!safeUrl) return;
    shell.openExternal(safeUrl);
  });

  // --- Context menu handler ---

  safeHandle("contextMenu:show", async (_event, items: unknown, position: unknown) => {
    if (!Array.isArray(items)) return null;

    return new Promise<string | null>((resolve) => {
      let hasDestructive = false;
      const template: Electron.MenuItemConstructorOptions[] = [];

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const { id, label, destructive } = item as {
          id?: string;
          label?: string;
          destructive?: boolean;
        };
        if (typeof id !== "string" || typeof label !== "string") continue;

        if (destructive && !hasDestructive) {
          hasDestructive = true;
          template.push({ type: "separator" });
        }

        template.push({
          label,
          click: () => resolve(id),
        });
      }

      const menu = Menu.buildFromTemplate(template);

      const popupOptions: Electron.PopupOptions = {
        window: mainWindow,
        callback: () => resolve(null),
      };

      if (typeof position === "object" && position !== null && "x" in position && "y" in position) {
        const { x, y } = position as { x: number; y: number };
        if (typeof x === "number" && typeof y === "number" && isFinite(x) && isFinite(y)) {
          popupOptions.x = Math.floor(x);
          popupOptions.y = Math.floor(y);
        }
      }

      menu.popup(popupOptions);
    });
  });

  // --- Theme handlers ---

  safeHandle("browser:create", (_event, paneId: unknown, url: unknown) => {
    if (typeof paneId !== "string" || typeof url !== "string") return;
    browserPaneManager.createPane(paneId, url);
  });

  safeHandle("browser:destroy", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.destroyPane(paneId);
  });

  safeHandle("browser:show", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.showPane(paneId);
  });

  safeHandle("browser:hide", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.hidePane(paneId);
  });

  safeHandle("browser:setVisiblePanes", (_event, paneIds: unknown) => {
    if (!Array.isArray(paneIds)) return;
    const valid = paneIds.filter((id): id is string => typeof id === "string");
    browserPaneManager.setVisiblePanes(valid);
  });

  safeHandle("browser:getRuntimeState", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return undefined;
    return browserPaneManager.getRuntimeState(paneId);
  });

  safeHandle("browser:navigate", (_event, paneId: unknown, url: unknown) => {
    if (typeof paneId !== "string" || typeof url !== "string") return;
    browserPaneManager.navigate(paneId, url);
  });

  safeHandle("browser:back", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.back(paneId);
  });

  safeHandle("browser:forward", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.forward(paneId);
  });

  safeHandle("browser:reload", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.reload(paneId);
  });

  safeHandle("browser:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.stop(paneId);
  });

  safeHandle("browser:setBounds", (event, paneId: unknown, bounds: unknown) => {
    if (typeof paneId !== "string" || typeof bounds !== "object" || bounds === null) return;
    const nextBounds = bounds as Partial<BrowserBounds>;
    if (
      typeof nextBounds.x !== "number" ||
      typeof nextBounds.y !== "number" ||
      typeof nextBounds.width !== "number" ||
      typeof nextBounds.height !== "number"
    ) {
      return;
    }

    const rendererHostBounds = findHostViewBounds(mainWindow.contentView, event.sender.id);
    const translatedBounds = translateRendererBoundsToContentBounds(
      nextBounds as BrowserBounds,
      rendererHostBounds,
    );
    browserPaneManager.setBounds(paneId, translatedBounds);
  });

  safeHandle("browser:setFocus", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.focusPane(paneId);
  });

  safeHandle("browser:setZoom", (_event, paneId: unknown, zoom: unknown) => {
    if (typeof paneId !== "string" || typeof zoom !== "number" || !isFinite(zoom)) return;
    browserPaneManager.setZoom(paneId, zoom);
  });

  safeHandle("browser:resetZoom", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.resetZoom(paneId);
  });

  safeHandle(
    "browser:findInPage",
    (_event, paneId: unknown, query: unknown, options?: BrowserFindInPageOptions) => {
      if (typeof paneId !== "string" || typeof query !== "string") return;
      browserPaneManager.findInPage(paneId, query, options);
    },
  );

  safeHandle(
    "browser:stopFindInPage",
    (_event, paneId: unknown, action?: BrowserStopFindAction) => {
      if (typeof paneId !== "string") return;
      browserPaneManager.stopFindInPage(paneId, action);
    },
  );

  safeHandle("browser:toggleDevTools", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.toggleDevTools(paneId);
  });

  safeHandle("browser:showContextMenu", (_event, paneId: unknown, position?: unknown) => {
    if (typeof paneId !== "string") return;
    if (position && (typeof position !== "object" || position === null)) return;
    let nextPosition: { x: number; y: number } | undefined;
    if (position && typeof position === "object" && position !== null) {
      const next = position as Partial<{ x: number; y: number }>;
      if (typeof next.x === "number" && typeof next.y === "number") {
        nextPosition = { x: next.x, y: next.y };
      }
    }
    browserPaneManager.showContextMenu(paneId, nextPosition);
  });

  safeHandle("browser:resolvePermission", (_event, requestToken: unknown, decision: unknown) => {
    if (typeof requestToken !== "string") return;
    if (decision !== "allow-once" && decision !== "allow-for-session" && decision !== "deny")
      return;
    browserPaneManager.resolvePermission(requestToken, decision as BrowserPermissionDecision);
  });

  safeHandle("browser:listChromeProfiles", async () => {
    return browserImportService?.listChromeProfiles() ?? [];
  });

  safeHandle("browser:importChrome", async (_event, profilePath: unknown, mode?: unknown) => {
    if (typeof profilePath !== "string" || !browserImportService) {
      return { ok: false, code: "INVALID_CHROME_PROFILE", importedCookies: 0, importedHistory: 0 };
    }

    const importMode = parseBrowserImportMode(mode);
    if (!importMode) {
      return {
        ok: false,
        code: "INVALID_BROWSER_IMPORT_MODE",
        importedCookies: 0,
        importedHistory: 0,
      };
    }

    const allowedProfiles = await browserImportService.listChromeProfiles();
    if (!allowedProfiles.some((profile) => profile.path === profilePath)) {
      return { ok: false, code: "INVALID_CHROME_PROFILE", importedCookies: 0, importedHistory: 0 };
    }

    return browserImportService.importChrome(profilePath, importMode);
  });

  safeHandle("browser:importSafari", async (_event, mode?: unknown) => {
    if (!browserImportService) {
      return {
        ok: false,
        code: "SAFARI_IMPORT_UNAVAILABLE",
        importedCookies: 0,
        importedHistory: 0,
      };
    }

    const importMode = parseBrowserImportMode(mode);
    if (!importMode) {
      return {
        ok: false,
        code: "INVALID_BROWSER_IMPORT_MODE",
        importedCookies: 0,
        importedHistory: 0,
      };
    }

    return browserImportService.importSafari(importMode);
  });

  safeHandle("browser:detectSafariAccess", async (_event, mode?: unknown) => {
    const importMode = parseBrowserImportMode(mode);
    if (!importMode) {
      return {
        ok: false,
        code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
        message: "Invalid Safari import mode.",
      };
    }

    return (
      browserImportService?.detectSafariAccess(importMode) ?? {
        ok: false,
        code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
        message: "Safari import service unavailable.",
      }
    );
  });

  // --- CLI install handler ---

  safeHandle("cli:install", async () => {
    const symlink = "/usr/local/bin/devspace";
    // Resolve the CLI script inside the app bundle.
    // In packaged mode:  .../Devspace.app/Contents/Resources/bin/devspace
    // In dev mode:       <project>/resources/bin/devspace
    const isPackaged = app.isPackaged;
    const scriptPath = isPackaged
      ? join(process.resourcesPath, "bin", "devspace")
      : join(app.getAppPath(), "resources", "bin", "devspace");

    if (!existsSync(scriptPath)) {
      return { ok: false, error: `CLI script not found at ${scriptPath}` };
    }

    try {
      // Remove existing symlink if present
      if (existsSync(symlink)) {
        try {
          unlinkSync(symlink);
        } catch (err) {
          console.warn("[ipc] Symlink removal failed, will try with elevated privileges:", err);
        }
      }

      try {
        symlinkSync(scriptPath, symlink);
      } catch (err) {
        console.warn("[ipc] Symlink creation failed, requesting admin privileges:", err);
        // Need admin privileges — use osascript to prompt.
        // execFileSync avoids shell parsing of the outer command.
        // Paths are escaped for AppleScript string syntax (\, "),
        // then `quoted form of` handles shell escaping for `ln`.
        const appleScript = `do shell script "ln -sf " & quoted form of "${escAS(scriptPath)}" & " " & quoted form of "${escAS(symlink)}" with administrator privileges`;
        execFileSync("osascript", ["-e", appleScript], { stdio: "ignore" });
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}

import { app, dialog, Menu, nativeTheme, shell } from "electron";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import { join } from "path";
import type { BrowserWindow } from "electron";
import type { AppUpdaterLike } from "../app-updater";
import { resolveDevelopmentPath } from "../dev-paths";
import {
  getMainProcessPerformanceSnapshot,
  resetMainProcessPerformanceCounters,
} from "../performance-monitor";
import { NOTE_ASSET_SCHEME } from "../note-asset-protocol";
import { getSafeExternalUrl } from "../validation";
import { getTrafficLightPosition } from "../window-chrome";
import { safeHandle, safeOn } from "./shared";

const MAX_NOTE_CONTENT_BYTES = 5 * 1024 * 1024;
const MAX_NOTE_ASSET_BYTES = 25 * 1024 * 1024;

/** Strip anything that would change which directory a save dialog writes to. */
function sanitizeFileName(value: string): string {
  return value
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Escape a string for embedding in an AppleScript double-quoted literal. */
function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isNoteContentTooLarge(content: string): boolean {
  return Buffer.byteLength(content, "utf8") > MAX_NOTE_CONTENT_BYTES;
}

export function registerSystemIpc(mainWindow: BrowserWindow, appUpdater?: AppUpdaterLike): void {
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

  safeOn("window:focusContent", () => {
    // Same raise-the-window side effect as focusing a pane, so it is only ever
    // moving focus *within* a window the user is already looking at. Asking
    // for it while they are elsewhere would pull the app to the front.
    if (!mainWindow.isFocused()) return;
    mainWindow.webContents.focus();
  });

  safeOn("window:setTitleBarHeight", (_event, height: unknown) => {
    if (typeof height !== "number" || !Number.isFinite(height)) return;
    mainWindow.setWindowButtonPosition(getTrafficLightPosition(height));
  });

  safeOn("window:setThemeMode", (_event, themeMode: unknown) => {
    if (themeMode !== "system" && themeMode !== "dark" && themeMode !== "light") {
      return;
    }

    nativeTheme.themeSource = themeMode;
  });

  safeHandle("window:isMaximized", () => {
    return mainWindow.isMaximized();
  });

  safeHandle("window:isFullScreen", () => {
    return mainWindow.isFullScreen();
  });

  safeHandle("app:getPerformanceSnapshot", () => {
    return getMainProcessPerformanceSnapshot();
  });

  safeHandle("app:resetPerformanceCounters", () => {
    resetMainProcessPerformanceCounters();
  });

  safeHandle("app:getUpdateState", () => {
    return appUpdater?.getState() ?? null;
  });

  safeHandle("app:checkForUpdates", () => {
    return appUpdater?.checkForUpdates("manual") ?? false;
  });

  safeHandle("app:installUpdate", () => {
    return appUpdater?.quitAndInstall() ?? false;
  });

  appUpdater?.onStateChange((state) => {
    mainWindow.webContents.send("app:updateStateChanged", state);
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window:maximizeChange", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window:maximizeChange", false);
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("window:fullScreenChange", true);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("window:fullScreenChange", false);
  });

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

  const notesDir = join(app.getPath("userData"), "notes");
  const noteAssetsDir = join(notesDir, "assets");
  const safeNoteId = /^[\w-]+$/;
  const safeAssetExtension = /^(png|jpg|jpeg|gif|webp|avif|svg)$/i;
  const noteSaveVersions = new Map<string, number>();

  const nextNoteSaveVersion = (noteId: string): number => {
    const version = (noteSaveVersions.get(noteId) ?? 0) + 1;
    noteSaveVersions.set(noteId, version);
    return version;
  };

  const saveNote = async (
    noteId: string,
    content: string,
    version: number,
  ): Promise<void | { error: string }> => {
    const filePath = join(notesDir, `${noteId}.md`);
    const tmpPath = join(notesDir, `${noteId}.${version}.${process.pid}.tmp`);

    try {
      await mkdir(notesDir, { recursive: true });
      await writeFile(tmpPath, content, "utf-8");

      if (noteSaveVersions.get(noteId) !== version) {
        await rm(tmpPath, { force: true });
        return;
      }

      await rename(tmpPath, filePath);
    } catch (err) {
      await rm(tmpPath, { force: true }).catch(() => {});
      console.error("[notes:save] Failed to save note:", noteId, err);
      return { error: `Failed to save note: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const saveNoteSync = (
    noteId: string,
    content: string,
    version: number,
  ): void | { error: string } => {
    const filePath = join(notesDir, `${noteId}.md`);
    const tmpPath = join(notesDir, `${noteId}.${version}.${process.pid}.tmp`);

    try {
      mkdirSync(notesDir, { recursive: true });
      writeFileSync(tmpPath, content, "utf-8");

      if (noteSaveVersions.get(noteId) !== version) {
        rmSync(tmpPath, { force: true });
        return;
      }

      renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        rmSync(tmpPath, { force: true });
      } catch {}
      console.error("[notes:saveSync] Failed to save note:", noteId, err);
      return { error: `Failed to save note: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  safeHandle("notes:read", async (_event, noteId: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) return null;
    const filePath = join(notesDir, `${noteId}.md`);
    try {
      return await readFile(filePath, "utf-8");
    } catch (err) {
      if (isMissingFileError(err)) {
        return null;
      }
      throw err;
    }
  });

  safeHandle("notes:save", async (_event, noteId: unknown, content: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) {
      return { error: "Invalid note ID" };
    }
    if (typeof content !== "string") {
      return { error: "Content must be a string" };
    }
    if (isNoteContentTooLarge(content)) {
      return { error: "Content is too large" };
    }

    return saveNote(noteId, content, nextNoteSaveVersion(noteId));
  });

  safeOn("notes:saveSync", (event, noteId: unknown, content: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) {
      event.returnValue = { error: "Invalid note ID" };
      return;
    }
    if (typeof content !== "string") {
      event.returnValue = { error: "Content must be a string" };
      return;
    }
    if (isNoteContentTooLarge(content)) {
      event.returnValue = { error: "Content is too large" };
      return;
    }

    event.returnValue = saveNoteSync(noteId, content, nextNoteSaveVersion(noteId));
  });

  safeHandle("notes:list", async () => {
    try {
      const files = await readdir(notesDir);
      return files.filter((file) => file.endsWith(".md")).map((file) => file.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  });

  safeHandle("notes:saveAsset", async (_event, bytes: unknown, extension: unknown) => {
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
      return { error: "Asset must be binary data" };
    }
    if (typeof extension !== "string" || !safeAssetExtension.test(extension)) {
      return { error: "Unsupported image type" };
    }

    // A TypedArray view can be a window onto a larger buffer, so its offset and
    // length have to be honoured — taking `.buffer` alone would hash and write
    // whatever else happens to share the allocation.
    const buffer = ArrayBuffer.isView(bytes)
      ? Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
      : Buffer.from(bytes);
    if (buffer.byteLength > MAX_NOTE_ASSET_BYTES) {
      return { error: "Image is too large" };
    }

    // Content-addressed: pasting the same screenshot into five notes stores it
    // once, and re-pasting after an undo doesn't leave an orphan behind.
    const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
    const fileName = `${digest}.${extension}`;

    try {
      await mkdir(noteAssetsDir, { recursive: true });
      const filePath = join(noteAssetsDir, fileName);
      if (!existsSync(filePath)) {
        await writeFile(filePath, buffer);
      }
      return { url: `${NOTE_ASSET_SCHEME}://${fileName}` };
    } catch (err) {
      console.error("[notes:saveAsset] Failed to store asset:", err);
      return {
        error: `Failed to store image: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  safeHandle("notes:reveal", async (_event, noteId: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) return { error: "Invalid note ID" };

    const filePath = join(notesDir, `${noteId}.md`);
    if (!existsSync(filePath)) return { error: "This note has not been saved yet" };

    shell.showItemInFolder(filePath);
  });

  safeHandle("notes:openExternal", async (_event, noteId: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) return { error: "Invalid note ID" };

    const filePath = join(notesDir, `${noteId}.md`);
    if (!existsSync(filePath)) return { error: "This note has not been saved yet" };

    const failure = await shell.openPath(filePath);
    if (failure) return { error: failure };
  });

  safeHandle("notes:exportTo", async (_event, noteId: unknown, suggestedName: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) return { error: "Invalid note ID" };
    if (typeof suggestedName !== "string") return { error: "Invalid file name" };

    const filePath = join(notesDir, `${noteId}.md`);

    let contents: string;
    try {
      contents = await readFile(filePath, "utf-8");
    } catch (err) {
      if (isMissingFileError(err)) return { error: "This note has not been saved yet" };
      throw err;
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFileName(suggestedName) || "note"}.md`,
      filters: [{ extensions: ["md"], name: "Markdown" }],
    });
    if (result.canceled || !result.filePath) return { canceled: true as const };

    try {
      await writeFile(result.filePath, contents, "utf-8");
      return { path: result.filePath };
    } catch (err) {
      return { error: `Failed to export: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  safeOn("shell:openExternal", (_event, url: unknown) => {
    const safeUrl = getSafeExternalUrl(url);
    if (!safeUrl) return;
    shell.openExternal(safeUrl);
  });

  safeHandle("contextMenu:show", async (_event, items: unknown, position: unknown) => {
    if (!Array.isArray(items)) return null;

    return new Promise<string | null>((resolve) => {
      let hasDestructive = false;
      const template: Electron.MenuItemConstructorOptions[] = [];

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const { id, label, destructive, disabled, separatorBefore } = item as {
          id?: string;
          label?: string;
          destructive?: boolean;
          disabled?: boolean;
          separatorBefore?: boolean;
        };
        if (typeof id !== "string" || typeof label !== "string") continue;

        // Destructive entries are pushed below a divider once, so the
        // dangerous end of the menu is always visually separated.
        if (destructive && !hasDestructive) {
          hasDestructive = true;
          template.push({ type: "separator" });
        } else if (separatorBefore === true && template.length > 0) {
          template.push({ type: "separator" });
        }

        template.push({
          label,
          ...(disabled === true ? { enabled: false } : {}),
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

  safeHandle("cli:install", async () => {
    const symlink = "/usr/local/bin/devspace";
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, "bin", "devspace")
      : resolveDevelopmentPath("apps/desktop/resources/bin/devspace", {
          appPath: app.getAppPath(),
          cwd: process.cwd(),
          moduleDir: __dirname,
        });

    if (!existsSync(scriptPath)) {
      return { ok: false, error: `CLI script not found at ${scriptPath}` };
    }

    try {
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
        const appleScript = `do shell script "ln -sf " & quoted form of "${escapeAppleScriptString(scriptPath)}" & " " & quoted form of "${escapeAppleScriptString(symlink)}" with administrator privileges`;
        execFileSync("osascript", ["-e", appleScript], { stdio: "ignore" });
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}

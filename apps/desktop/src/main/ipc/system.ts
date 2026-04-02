import { app, dialog, Menu, shell } from "electron";
import { execFileSync } from "child_process";
import { existsSync, symlinkSync, unlinkSync } from "fs";
import { mkdir, readFile, readdir, rename, writeFile } from "fs/promises";
import { join } from "path";
import type { BrowserWindow } from "electron";
import { getSafeExternalUrl, validateFilePath } from "../validation";
import { getTrafficLightPosition } from "../window-chrome";
import { safeHandle, safeOn } from "./shared";

/** Escape a string for embedding in an AppleScript double-quoted literal. */
function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function registerSystemIpc(mainWindow: BrowserWindow, allowedRoots: string[]): void {
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
    mainWindow.webContents.focus();
  });

  safeOn("window:setSidebarOpen", (_event, open: unknown) => {
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

  safeHandle("fs:readFile", async (_event, filePath: unknown) => {
    const validPath = await validateFilePath(filePath, allowedRoots);
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
    const validPath = await validateFilePath(filePath, allowedRoots);
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

  const notesDir = join(app.getPath("userData"), "notes");
  const safeNoteId = /^[\w-]+$/;

  safeHandle("notes:read", async (_event, noteId: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) return null;
    const filePath = join(notesDir, `${noteId}.md`);
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  });

  safeHandle("notes:save", async (_event, noteId: unknown, content: unknown) => {
    if (typeof noteId !== "string" || !safeNoteId.test(noteId)) {
      return { error: "Invalid note ID" };
    }
    if (typeof content !== "string") {
      return { error: "Content must be a string" };
    }

    try {
      await mkdir(notesDir, { recursive: true });
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
      return files.filter((file) => file.endsWith(".md")).map((file) => file.replace(/\.md$/, ""));
    } catch {
      return [];
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

  safeHandle("cli:install", async () => {
    const symlink = "/usr/local/bin/devspace";
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, "bin", "devspace")
      : join(app.getAppPath(), "resources", "bin", "devspace");

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

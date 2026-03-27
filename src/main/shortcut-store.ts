/**
 * Main-process shortcut persistence store.
 *
 * Persists user-customized shortcuts as a JSON file in the app's userData directory.
 * Provides IPC handlers for the renderer to read/write shortcuts.
 * Emits a callback when shortcuts change so the menu and native bridge can be updated.
 */

import { app, ipcMain } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { SHORTCUT_MAP, type ShortcutAction, type StoredShortcut } from "../shared/shortcuts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Serialized format of the shortcuts file. */
interface ShortcutFileData {
  version: 1;
  overrides: Record<string, StoredShortcut>;
}

type ShortcutChangeCallback = () => void;

// ---------------------------------------------------------------------------
// ShortcutStore
// ---------------------------------------------------------------------------

export class ShortcutStore {
  private readonly filePath: string;
  private overrides: Map<ShortcutAction, StoredShortcut>;
  private onChangeCallbacks: ShortcutChangeCallback[] = [];

  constructor(userDataPath?: string) {
    const dataDir = userDataPath ?? app.getPath("userData");
    this.filePath = join(dataDir, "shortcuts.json");
    this.overrides = this.loadFromDisk();
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Get the user's override for an action, or undefined if using default. */
  getOverride(action: ShortcutAction): StoredShortcut | undefined {
    return this.overrides.get(action);
  }

  /** Get all user overrides as a readonly map. */
  getAllOverrides(): ReadonlyMap<ShortcutAction, StoredShortcut> {
    return this.overrides;
  }

  /** Get all overrides as a plain object (for IPC serialization). */
  getAllOverridesObject(): Record<string, StoredShortcut> {
    const obj: Record<string, StoredShortcut> = {};
    for (const [action, shortcut] of this.overrides) {
      obj[action] = shortcut;
    }
    return obj;
  }

  // ── Write ─────────────────────────────────────────────────────────────

  /** Set a custom shortcut for an action. */
  setShortcut(action: ShortcutAction, shortcut: StoredShortcut): void {
    this.overrides.set(action, shortcut);
    this.saveToDisk();
    this.notifyChange();
  }

  /** Reset a single action to its default shortcut. */
  resetShortcut(action: ShortcutAction): void {
    if (!this.overrides.has(action)) return;
    this.overrides.delete(action);
    this.saveToDisk();
    this.notifyChange();
  }

  /** Reset all shortcuts to defaults. */
  resetAll(): void {
    if (this.overrides.size === 0) return;
    this.overrides.clear();
    this.saveToDisk();
    this.notifyChange();
  }

  // ── Change notifications ──────────────────────────────────────────────

  /** Register a callback for when shortcuts change. Returns an unsubscribe function. */
  onChange(callback: ShortcutChangeCallback): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyChange(): void {
    for (const cb of this.onChangeCallbacks) {
      try {
        cb();
      } catch (err) {
        console.error("[ShortcutStore] onChange callback error:", err);
      }
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private loadFromDisk(): Map<ShortcutAction, StoredShortcut> {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw) as ShortcutFileData;
      if (data.version !== 1 || typeof data.overrides !== "object") {
        return new Map();
      }
      const map = new Map<ShortcutAction, StoredShortcut>();
      for (const [action, shortcut] of Object.entries(data.overrides)) {
        if (isValidStoredShortcut(shortcut)) {
          map.set(action as ShortcutAction, shortcut);
        }
      }
      return map;
    } catch {
      // File doesn't exist or is invalid — start with no overrides
      return new Map();
    }
  }

  private saveToDisk(): void {
    const data: ShortcutFileData = {
      version: 1,
      overrides: this.getAllOverridesObject(),
    };
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[ShortcutStore] Failed to save shortcuts:", err);
    }
  }

  // ── IPC handlers ──────────────────────────────────────────────────────

  /** Register IPC handlers for renderer communication. Call once during app init. */
  registerIpcHandlers(): void {
    ipcMain.handle("shortcuts:get-all", () => {
      return this.getAllOverridesObject();
    });

    ipcMain.handle("shortcuts:set", (_event, action: ShortcutAction, shortcut: StoredShortcut) => {
      if (!SHORTCUT_MAP.has(action)) {
        throw new Error(`Unknown shortcut action: ${action}`);
      }
      if (!isValidStoredShortcut(shortcut)) {
        throw new Error("Invalid shortcut format");
      }
      this.setShortcut(action, shortcut);
    });

    ipcMain.handle("shortcuts:reset", (_event, action: ShortcutAction) => {
      this.resetShortcut(action);
    });

    ipcMain.handle("shortcuts:reset-all", () => {
      this.resetAll();
    });
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidStoredShortcut(value: unknown): value is StoredShortcut {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["key"] === "string" &&
    obj["key"].length > 0 &&
    typeof obj["command"] === "boolean" &&
    typeof obj["shift"] === "boolean" &&
    typeof obj["option"] === "boolean" &&
    typeof obj["control"] === "boolean"
  );
}

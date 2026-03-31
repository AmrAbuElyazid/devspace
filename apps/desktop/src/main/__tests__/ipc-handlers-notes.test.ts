import { expect, vi, test, describe, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

const TEST_NOTES_DIR = join("/tmp", `devspace-notes-test-${process.pid}`);

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
    on: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  app: {
    getPath: () => TEST_NOTES_DIR,
    isPackaged: false,
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
          getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
        },
      ],
    },
    on: () => {},
    minimize: () => {},
    isMaximized: () => false,
    unmaximize: () => {},
    maximize: () => {},
    setWindowButtonPosition: () => {},
    close: () => {},
  } as any,
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
  } as any,
  {
    createPane: () => {},
    destroyPane: () => {},
    showPane: () => {},
    hidePane: () => {},
    getRuntimeState: () => undefined,
    navigate: () => {},
    back: () => {},
    forward: () => {},
    reload: () => {},
    stop: () => {},
    setBounds: () => {},
    focusPane: () => {},
    setZoom: () => {},
    resetZoom: () => {},
    findInPage: () => {},
    stopFindInPage: () => {},
    toggleDevTools: () => {},
    showContextMenu: () => {},
    resolvePermission: () => {},
  } as any,
  {
    isAvailable: () => false,
    start: async () => ({ error: "test" }),
    release: () => {},
    stopAll: () => {},
  } as any,
  {
    isAvailable: () => false,
    start: async () => ({ error: "test" }),
    release: () => {},
    stopAll: () => {},
  } as any,
);

const notesDir = join(TEST_NOTES_DIR, "notes");

function callHandler(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler for ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  // Ensure clean notes directory
  if (existsSync(notesDir)) {
    await rm(notesDir, { recursive: true });
  }
});

afterEach(async () => {
  if (existsSync(notesDir)) {
    await rm(notesDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// notes:read
// ---------------------------------------------------------------------------
describe("notes:read", () => {
  test("returns null for non-existent note", async () => {
    const result = await callHandler("notes:read", "nonexistent");
    expect(result).toBeNull();
  });

  test("returns content for existing note", async () => {
    await mkdir(notesDir, { recursive: true });
    const content = JSON.stringify([{ type: "p", children: [{ text: "hello" }] }]);
    const { writeFile: wf } = await import("fs/promises");
    await wf(join(notesDir, "test-note.json"), content, "utf-8");

    const result = await callHandler("notes:read", "test-note");
    expect(result).toBe(content);
  });

  test("rejects empty noteId", async () => {
    expect(await callHandler("notes:read", "")).toBeNull();
  });

  test("rejects non-string noteId", async () => {
    expect(await callHandler("notes:read", 123)).toBeNull();
    expect(await callHandler("notes:read", null)).toBeNull();
    expect(await callHandler("notes:read", undefined)).toBeNull();
  });

  test("rejects path traversal attempts", async () => {
    expect(await callHandler("notes:read", "../etc/passwd")).toBeNull();
    expect(await callHandler("notes:read", "../../secret")).toBeNull();
    expect(await callHandler("notes:read", "foo/bar")).toBeNull();
    expect(await callHandler("notes:read", "foo.bar.baz")).toBeNull();
  });

  test("allows valid noteId characters", async () => {
    // Should not throw — just return null (file doesn't exist)
    expect(await callHandler("notes:read", "abc123")).toBeNull();
    expect(await callHandler("notes:read", "my-note-id")).toBeNull();
    expect(await callHandler("notes:read", "note_with_underscores")).toBeNull();
    expect(await callHandler("notes:read", "ABC-123_xyz")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// notes:save
// ---------------------------------------------------------------------------
describe("notes:save", () => {
  test("saves note to disk", async () => {
    const content = JSON.stringify([{ type: "p", children: [{ text: "saved" }] }]);
    await callHandler("notes:save", "save-test", content);

    const onDisk = await readFile(join(notesDir, "save-test.json"), "utf-8");
    expect(onDisk).toBe(content);
  });

  test("creates notes directory if missing", async () => {
    expect(existsSync(notesDir)).toBe(false);
    await callHandler("notes:save", "first-note", "[]");
    expect(existsSync(notesDir)).toBe(true);
  });

  test("atomic write — no .tmp file left behind on success", async () => {
    await callHandler("notes:save", "atomic-test", '{"data":true}');
    expect(existsSync(join(notesDir, "atomic-test.tmp"))).toBe(false);
    expect(existsSync(join(notesDir, "atomic-test.json"))).toBe(true);
  });

  test("rejects path traversal in noteId", async () => {
    const result = await callHandler("notes:save", "../escape", "content");
    expect(result).toEqual({ error: "Invalid note ID" });
  });

  test("rejects non-string content", async () => {
    const result = await callHandler("notes:save", "valid-id", 123);
    expect(result).toEqual({ error: "Content must be a string" });
  });

  test("rejects empty noteId", async () => {
    const result = await callHandler("notes:save", "", "content");
    expect(result).toEqual({ error: "Invalid note ID" });
  });

  test("overwrites existing note", async () => {
    await callHandler("notes:save", "overwrite-test", '"first"');
    await callHandler("notes:save", "overwrite-test", '"second"');
    const onDisk = await readFile(join(notesDir, "overwrite-test.json"), "utf-8");
    expect(onDisk).toBe('"second"');
  });
});

// ---------------------------------------------------------------------------
// notes:list
// ---------------------------------------------------------------------------
describe("notes:list", () => {
  test("returns empty array when no notes exist", async () => {
    const result = await callHandler("notes:list");
    expect(result).toEqual([]);
  });

  test("lists note IDs without .json extension", async () => {
    await callHandler("notes:save", "note-a", "{}");
    await callHandler("notes:save", "note-b", "{}");
    const result = (await callHandler("notes:list")) as string[];
    expect(result.toSorted()).toEqual(["note-a", "note-b"]);
  });

  test("excludes non-json files", async () => {
    await mkdir(notesDir, { recursive: true });
    const { writeFile: wf } = await import("fs/promises");
    await wf(join(notesDir, "note-a.json"), "{}", "utf-8");
    await wf(join(notesDir, "note-b.tmp"), "{}", "utf-8");
    await wf(join(notesDir, "readme.txt"), "hello", "utf-8");
    const result = (await callHandler("notes:list")) as string[];
    expect(result).toEqual(["note-a"]);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

// Mock electron modules before importing ShortcutStore
import { vi } from "vitest";
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { ShortcutStore } from "../shortcut-store";
import type { StoredShortcut, ShortcutAction } from "../../shared/shortcuts";

function makeTempDir(): string {
  const dir = join(tmpdir(), `shortcut-store-test-${randomBytes(8).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("ShortcutStore", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("starts with no overrides", () => {
    const store = new ShortcutStore(tempDir);
    expect(store.getAllOverrides().size).toBe(0);
  });

  it("sets and retrieves a shortcut override", () => {
    const store = new ShortcutStore(tempDir);
    const shortcut: StoredShortcut = {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    store.setShortcut("toggle-sidebar", shortcut);
    expect(store.getOverride("toggle-sidebar")).toEqual(shortcut);
  });

  it("persists to disk and reloads", () => {
    const shortcut: StoredShortcut = {
      key: "x",
      command: true,
      shift: true,
      option: false,
      control: false,
    };

    // Write
    const store1 = new ShortcutStore(tempDir);
    store1.setShortcut("new-tab", shortcut);

    // Read back in a new instance
    const store2 = new ShortcutStore(tempDir);
    expect(store2.getOverride("new-tab")).toEqual(shortcut);
  });

  it("resets a single shortcut", () => {
    const store = new ShortcutStore(tempDir);
    const shortcut: StoredShortcut = {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    store.setShortcut("toggle-sidebar", shortcut);
    expect(store.getOverride("toggle-sidebar")).toBeDefined();

    store.resetShortcut("toggle-sidebar");
    expect(store.getOverride("toggle-sidebar")).toBeUndefined();
  });

  it("resets all shortcuts", () => {
    const store = new ShortcutStore(tempDir);
    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    store.setShortcut("new-tab", {
      key: "y",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    expect(store.getAllOverrides().size).toBe(2);

    store.resetAll();
    expect(store.getAllOverrides().size).toBe(0);
  });

  it("fires change callback on set", () => {
    const store = new ShortcutStore(tempDir);
    let called = false;
    store.onChange(() => {
      called = true;
    });

    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    expect(called).toBe(true);
  });

  it("fires change callback on reset", () => {
    const store = new ShortcutStore(tempDir);
    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });

    let called = false;
    store.onChange(() => {
      called = true;
    });

    store.resetShortcut("toggle-sidebar");
    expect(called).toBe(true);
  });

  it("unsubscribe stops callbacks", () => {
    const store = new ShortcutStore(tempDir);
    let callCount = 0;
    const unsub = store.onChange(() => {
      callCount++;
    });

    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    expect(callCount).toBe(1);

    unsub();
    store.setShortcut("new-tab", {
      key: "y",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    expect(callCount).toBe(1);
  });

  it("getAllOverridesObject returns a plain object", () => {
    const store = new ShortcutStore(tempDir);
    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
    const obj = store.getAllOverridesObject();
    expect(typeof obj).toBe("object");
    expect(obj["toggle-sidebar"]).toEqual({
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
  });

  it("ignores invalid data on disk gracefully", () => {
    const filePath = join(tempDir, "shortcuts.json");
    // Write invalid data
    const { writeFileSync } = require("fs");
    writeFileSync(
      filePath,
      '{"version":1,"overrides":{"toggle-sidebar":{"key":"x","command":"not-a-boolean"}}}',
    );

    const store = new ShortcutStore(tempDir);
    // Invalid entry should be skipped
    expect(store.getOverride("toggle-sidebar" as ShortcutAction)).toBeUndefined();
  });

  it("ignores malformed JSON on disk", () => {
    const filePath = join(tempDir, "shortcuts.json");
    const { writeFileSync } = require("fs");
    writeFileSync(filePath, "not json at all");

    const store = new ShortcutStore(tempDir);
    expect(store.getAllOverrides().size).toBe(0);
  });

  it("does not fire callback for no-op resetShortcut", () => {
    const store = new ShortcutStore(tempDir);
    let called = false;
    store.onChange(() => {
      called = true;
    });
    store.resetShortcut("toggle-sidebar"); // not overridden, should be no-op
    expect(called).toBe(false);
  });

  it("does not fire callback for no-op resetAll", () => {
    const store = new ShortcutStore(tempDir);
    let called = false;
    store.onChange(() => {
      called = true;
    });
    store.resetAll(); // nothing to reset
    expect(called).toBe(false);
  });

  it("writes valid JSON file", () => {
    const store = new ShortcutStore(tempDir);
    store.setShortcut("toggle-sidebar", {
      key: "x",
      command: true,
      shift: false,
      option: false,
      control: false,
    });

    const raw = readFileSync(join(tempDir, "shortcuts.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(data.overrides["toggle-sidebar"]).toBeDefined();
  });
});

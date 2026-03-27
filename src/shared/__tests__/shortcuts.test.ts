import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_MAP,
  SHORTCUT_CATEGORIES,
  findConflict,
  fromKeyboardEvent,
  getAllNativeBridgeShortcuts,
  getNumberedGroupDisplayString,
  getShortcutDefinition,
  getShortcutsForCategory,
  getVisibleShortcutsForCategory,
  resolveDisplayString,
  resolveShortcut,
  shortcutsEqual,
  toDisplayString,
  toElectronAccelerator,
  toKeyDisplayString,
  toModifierDisplayString,
  toNativeBridgeFormat,
  type StoredShortcut,
} from "../shortcuts";

// ---------------------------------------------------------------------------
// toElectronAccelerator
// ---------------------------------------------------------------------------

describe("toElectronAccelerator", () => {
  it("converts Cmd+D", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Cmd+D");
  });

  it("converts Cmd+Shift+D", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Shift+Cmd+D");
  });

  it("converts Cmd+Alt+ArrowLeft", () => {
    const s: StoredShortcut = {
      key: "arrowleft",
      command: true,
      shift: false,
      option: true,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Alt+Cmd+Left");
  });

  it("converts Ctrl+1", () => {
    const s: StoredShortcut = {
      key: "1",
      command: false,
      shift: false,
      option: false,
      control: true,
    };
    expect(toElectronAccelerator(s)).toBe("Ctrl+1");
  });

  it("converts Cmd+Shift+Enter", () => {
    const s: StoredShortcut = {
      key: "enter",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Shift+Cmd+Return");
  });

  it("converts Cmd+,", () => {
    const s: StoredShortcut = {
      key: ",",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Cmd+,");
  });

  it("converts Cmd+[", () => {
    const s: StoredShortcut = {
      key: "[",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toElectronAccelerator(s)).toBe("Cmd+[");
  });
});

// ---------------------------------------------------------------------------
// toDisplayString
// ---------------------------------------------------------------------------

describe("toDisplayString", () => {
  it("renders Cmd+D as ⌘D", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toDisplayString(s)).toBe("⌘D");
  });

  it("renders Cmd+Shift+D as ⇧⌘D", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(toDisplayString(s)).toBe("⇧⌘D");
  });

  it("renders Ctrl+Alt+Shift+Cmd+B as ⌃⌥⇧⌘B (correct macOS order)", () => {
    const s: StoredShortcut = { key: "b", command: true, shift: true, option: true, control: true };
    expect(toDisplayString(s)).toBe("⌃⌥⇧⌘B");
  });

  it("renders arrow keys with glyphs", () => {
    const s: StoredShortcut = {
      key: "arrowleft",
      command: true,
      shift: false,
      option: true,
      control: false,
    };
    expect(toDisplayString(s)).toBe("⌥⌘←");
  });

  it("renders enter as ↩", () => {
    const s: StoredShortcut = {
      key: "enter",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(toDisplayString(s)).toBe("⇧⌘↩");
  });

  it("renders Ctrl+1", () => {
    const s: StoredShortcut = {
      key: "1",
      command: false,
      shift: false,
      option: false,
      control: true,
    };
    expect(toDisplayString(s)).toBe("⌃1");
  });
});

describe("toModifierDisplayString", () => {
  it("returns only modifiers", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(toModifierDisplayString(s)).toBe("⇧⌘");
  });
});

describe("toKeyDisplayString", () => {
  it("returns key glyph", () => {
    const s: StoredShortcut = {
      key: "arrowup",
      command: true,
      shift: false,
      option: true,
      control: false,
    };
    expect(toKeyDisplayString(s)).toBe("↑");
  });

  it("returns uppercase letter", () => {
    const s: StoredShortcut = {
      key: "b",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toKeyDisplayString(s)).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// fromKeyboardEvent
// ---------------------------------------------------------------------------

describe("fromKeyboardEvent", () => {
  it("converts a Cmd+D event", () => {
    const result = fromKeyboardEvent({
      key: "d",
      metaKey: true,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    });
    expect(result).toEqual({
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    });
  });

  it("converts special keys", () => {
    const result = fromKeyboardEvent({
      key: "ArrowLeft",
      metaKey: true,
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
    });
    expect(result).toEqual({
      key: "arrowleft",
      command: true,
      shift: false,
      option: true,
      control: false,
    });
  });

  it("returns null for bare modifier press", () => {
    expect(
      fromKeyboardEvent({
        key: "Shift",
        metaKey: false,
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
      }),
    ).toBeNull();
    expect(
      fromKeyboardEvent({
        key: "Meta",
        metaKey: true,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toNativeBridgeFormat / getAllNativeBridgeShortcuts
// ---------------------------------------------------------------------------

describe("toNativeBridgeFormat", () => {
  it("returns same shape", () => {
    const s: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(toNativeBridgeFormat(s)).toEqual(s);
  });
});

describe("getAllNativeBridgeShortcuts", () => {
  it("returns all shortcuts in bridge format", () => {
    const all = getAllNativeBridgeShortcuts();
    expect(all.length).toBe(DEFAULT_SHORTCUTS.length);
    for (const s of all) {
      expect(s).toHaveProperty("key");
      expect(s).toHaveProperty("command");
      expect(s).toHaveProperty("shift");
      expect(s).toHaveProperty("option");
      expect(s).toHaveProperty("control");
    }
  });

  it("applies overrides", () => {
    const overrides = new Map([
      [
        "toggle-sidebar" as const,
        { key: "x", command: true, shift: false, option: false, control: false },
      ],
    ]);
    const all = getAllNativeBridgeShortcuts(overrides);
    const sidebar = all.find(
      (s) => s.key === "x" && s.command && !s.shift && !s.option && !s.control,
    );
    expect(sidebar).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// shortcutsEqual / findConflict
// ---------------------------------------------------------------------------

describe("shortcutsEqual", () => {
  it("returns true for identical shortcuts", () => {
    const a: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    const b: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(shortcutsEqual(a, b)).toBe(true);
  });

  it("returns false for different keys", () => {
    const a: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    const b: StoredShortcut = {
      key: "e",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    expect(shortcutsEqual(a, b)).toBe(false);
  });

  it("returns false for different modifiers", () => {
    const a: StoredShortcut = {
      key: "d",
      command: true,
      shift: false,
      option: false,
      control: false,
    };
    const b: StoredShortcut = {
      key: "d",
      command: true,
      shift: true,
      option: false,
      control: false,
    };
    expect(shortcutsEqual(a, b)).toBe(false);
  });
});

describe("findConflict", () => {
  it("finds a conflicting shortcut", () => {
    // Cmd+B is toggle-sidebar's default — setting it on a different action should conflict
    const conflict = findConflict(
      { key: "b", command: true, shift: false, option: false, control: false },
      "new-tab",
    );
    expect(conflict).toBeDefined();
    expect(conflict?.action).toBe("toggle-sidebar");
  });

  it("does not conflict with itself", () => {
    const conflict = findConflict(
      { key: "b", command: true, shift: false, option: false, control: false },
      "toggle-sidebar",
    );
    expect(conflict).toBeUndefined();
  });

  it("uses overrides for conflict detection", () => {
    // Override toggle-sidebar to Cmd+X, then Cmd+B should not conflict
    const overrides = new Map([
      [
        "toggle-sidebar" as const,
        { key: "x", command: true, shift: false, option: false, control: false },
      ],
    ]);
    const conflict = findConflict(
      { key: "b", command: true, shift: false, option: false, control: false },
      "new-tab",
      overrides,
    );
    expect(conflict).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe("SHORTCUT_MAP", () => {
  it("contains all shortcuts", () => {
    expect(SHORTCUT_MAP.size).toBe(DEFAULT_SHORTCUTS.length);
  });

  it("maps action to definition", () => {
    const def = SHORTCUT_MAP.get("toggle-sidebar");
    expect(def).toBeDefined();
    expect(def?.label).toBe("Toggle Sidebar");
    expect(def?.defaultShortcut.key).toBe("b");
  });
});

describe("getShortcutDefinition", () => {
  it("returns the definition for a known action", () => {
    const def = getShortcutDefinition("new-tab");
    expect(def).toBeDefined();
    expect(def?.defaultShortcut.key).toBe("t");
  });

  it("returns undefined for unknown action", () => {
    expect(getShortcutDefinition("nonexistent" as never)).toBeUndefined();
  });
});

describe("getShortcutsForCategory", () => {
  it("returns all shortcuts for a category", () => {
    const general = getShortcutsForCategory("general");
    expect(general.length).toBeGreaterThanOrEqual(3);
    for (const s of general) {
      expect(s.category).toBe("general");
    }
  });
});

describe("getVisibleShortcutsForCategory", () => {
  it("excludes hidden shortcuts", () => {
    const workspaces = getVisibleShortcutsForCategory("workspaces");
    for (const s of workspaces) {
      expect(s.hidden).toBeFalsy();
    }
  });

  it("returns fewer than total for workspaces (numbered are hidden)", () => {
    const all = getShortcutsForCategory("workspaces");
    const visible = getVisibleShortcutsForCategory("workspaces");
    expect(visible.length).toBeLessThan(all.length);
  });
});

describe("SHORTCUT_CATEGORIES", () => {
  it("has all categories in order", () => {
    expect(SHORTCUT_CATEGORIES.map((c) => c.id)).toEqual([
      "general",
      "workspaces",
      "tabs",
      "panes",
      "terminal",
      "browser",
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolveShortcut / resolveDisplayString
// ---------------------------------------------------------------------------

describe("resolveShortcut", () => {
  it("returns default when no overrides", () => {
    const shortcut = resolveShortcut("toggle-sidebar");
    expect(shortcut.key).toBe("b");
    expect(shortcut.command).toBe(true);
  });

  it("returns override when present", () => {
    const overrides = new Map([
      [
        "toggle-sidebar" as const,
        { key: "x", command: true, shift: false, option: false, control: false },
      ],
    ]);
    const shortcut = resolveShortcut("toggle-sidebar", overrides);
    expect(shortcut.key).toBe("x");
  });

  it("throws for unknown action", () => {
    expect(() => resolveShortcut("nonexistent" as never)).toThrow();
  });
});

describe("resolveDisplayString", () => {
  it("returns display string for default", () => {
    expect(resolveDisplayString("toggle-sidebar")).toBe("⌘B");
  });

  it("returns display string for override", () => {
    const overrides = new Map([
      [
        "toggle-sidebar" as const,
        { key: "x", command: true, shift: true, option: false, control: false },
      ],
    ]);
    expect(resolveDisplayString("toggle-sidebar", overrides)).toBe("⇧⌘X");
  });
});

describe("getNumberedGroupDisplayString", () => {
  it("returns modifier + 1...9 for workspace selection", () => {
    expect(getNumberedGroupDisplayString("select-workspace")).toBe("⌘1...9");
  });

  it("returns modifier + 1...9 for tab selection", () => {
    expect(getNumberedGroupDisplayString("select-tab")).toBe("⌃1...9");
  });
});

// ---------------------------------------------------------------------------
// Registry integrity
// ---------------------------------------------------------------------------

describe("DEFAULT_SHORTCUTS integrity", () => {
  it("has no duplicate actions", () => {
    const actions = DEFAULT_SHORTCUTS.map((d) => d.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("every action has a non-empty label", () => {
    for (const d of DEFAULT_SHORTCUTS) {
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("every action has a valid category", () => {
    const validCategories = new Set(SHORTCUT_CATEGORIES.map((c) => c.id));
    for (const d of DEFAULT_SHORTCUTS) {
      expect(validCategories.has(d.category)).toBe(true);
    }
  });

  it("every action has an IPC channel starting with app:", () => {
    for (const d of DEFAULT_SHORTCUTS) {
      expect(d.ipcChannel.startsWith("app:")).toBe(true);
    }
  });

  it("workspace select shortcuts use numbered flag", () => {
    for (let i = 1; i <= 9; i++) {
      const def = SHORTCUT_MAP.get(`select-workspace-${i}` as never);
      expect(def?.numbered).toBe(true);
      expect(def?.hidden).toBe(true);
    }
  });

  it("tab select shortcuts use numbered flag", () => {
    for (let i = 1; i <= 9; i++) {
      const def = SHORTCUT_MAP.get(`select-tab-${i}` as never);
      expect(def?.numbered).toBe(true);
      expect(def?.hidden).toBe(true);
    }
  });
});

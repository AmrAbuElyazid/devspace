/**
 * Central shortcut registry — single source of truth for all keyboard shortcuts.
 *
 * Architecture:
 * - StoredShortcut: serializable key+modifier combo (persisted as JSON)
 * - ShortcutAction: string identifier for each bindable action
 * - ShortcutDefinition: full metadata (label, category, default, IPC channel)
 * - DEFAULT_SHORTCUTS: the complete map of built-in shortcuts
 *
 * Helpers convert between StoredShortcut and:
 * - Electron accelerator strings (for Menu items)
 * - macOS display strings with glyphs (for UI)
 * - Native bridge format (for isAppReservedShortcut)
 * - DOM KeyboardEvent (for the recorder component)
 */

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** Serializable representation of a key + modifier combo. */
export interface StoredShortcut {
  /** The key character (lowercase letter, digit, symbol, or special name).
   *  Special names: "enter", "tab", "escape", "space", "delete", "backspace",
   *  "arrowup", "arrowdown", "arrowleft", "arrowright",
   *  "f1"-"f12", "[", "]", "=", "-", "0"-"9", ",", "." */
  key: string;
  command: boolean;
  shift: boolean;
  option: boolean;
  control: boolean;
}

/** Categories for grouping in the settings UI. */
export type ShortcutCategory = "general" | "workspaces" | "tabs" | "panes" | "terminal" | "browser";

/** All bindable actions. */
export type ShortcutAction =
  // General
  | "leader"
  | "toggle-sidebar"
  | "toggle-settings"
  | "close-window"
  // Workspaces
  | "new-workspace"
  | "close-workspace"
  | "rename-workspace"
  | "next-workspace"
  | "prev-workspace"
  | "select-workspace-1"
  | "select-workspace-2"
  | "select-workspace-3"
  | "select-workspace-4"
  | "select-workspace-5"
  | "select-workspace-6"
  | "select-workspace-7"
  | "select-workspace-8"
  | "select-workspace-9"
  // Tabs
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "recent-tab"
  | "recent-tab-reverse"
  | "select-tab-1"
  | "select-tab-2"
  | "select-tab-3"
  | "select-tab-4"
  | "select-tab-5"
  | "select-tab-6"
  | "select-tab-7"
  | "select-tab-8"
  | "select-tab-9"
  | "rename-tab"
  // Panes
  | "split-right"
  | "split-down"
  | "focus-pane-left"
  | "focus-pane-right"
  | "focus-pane-up"
  | "focus-pane-down"
  | "toggle-pane-zoom"
  // Terminal
  | "terminal-zoom-in"
  | "terminal-zoom-out"
  | "terminal-zoom-reset"
  // Browser
  | "browser-focus-url"
  | "browser-reload"
  | "browser-back"
  | "browser-forward"
  | "browser-find"
  | "browser-zoom-in"
  | "browser-zoom-out"
  | "browser-zoom-reset"
  | "browser-devtools"
  | "open-browser";

/** IPC channel for a shortcut action. Sent from main → renderer via menu accelerator.
 *  For context-sensitive shortcuts, the renderer dispatches based on focused pane type. */
export type ShortcutIpcChannel = `app:${string}`;

/** Full definition of a shortcut action. */
export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  category: ShortcutCategory;
  defaultShortcut: StoredShortcut;
  /** IPC channel sent when the shortcut fires. */
  ipcChannel: ShortcutIpcChannel;
  /** If true, don't show in the menu bar (e.g. numbered workspace/tab switchers). */
  hidden?: boolean;
  /** If true, this shortcut uses the numbered-digit matching pattern (1-9). */
  numbered?: boolean;
  /** Menu submenu this belongs to. Defaults to category-based placement. */
  menuGroup?: string;
}

// ---------------------------------------------------------------------------
// Shortcut factory helpers
// ---------------------------------------------------------------------------

function cmd(key: string): StoredShortcut {
  return { key, command: true, shift: false, option: false, control: false };
}

function cmdShift(key: string): StoredShortcut {
  return { key, command: true, shift: true, option: false, control: false };
}

function cmdOpt(key: string): StoredShortcut {
  return { key, command: true, shift: false, option: true, control: false };
}

function cmdCtrl(key: string): StoredShortcut {
  return { key, command: true, shift: false, option: false, control: true };
}

function ctrl(key: string): StoredShortcut {
  return { key, command: false, shift: false, option: false, control: true };
}

// ---------------------------------------------------------------------------
// Default shortcuts
// ---------------------------------------------------------------------------

export const DEFAULT_SHORTCUTS: readonly ShortcutDefinition[] = [
  // ── General ──────────────────────────────────────────────────────────
  {
    action: "leader",
    label: "Leader",
    category: "general",
    defaultShortcut: cmd("k"),
    ipcChannel: "app:leader",
    menuGroup: "App",
  },
  {
    action: "toggle-sidebar",
    label: "Toggle Sidebar",
    category: "general",
    defaultShortcut: cmd("b"),
    ipcChannel: "app:toggle-sidebar",
    menuGroup: "View",
  },
  {
    action: "toggle-settings",
    label: "Settings",
    category: "general",
    defaultShortcut: cmd(","),
    ipcChannel: "app:toggle-settings",
    menuGroup: "App",
  },
  {
    action: "close-window",
    label: "Close Window",
    category: "general",
    defaultShortcut: cmdCtrl("w"),
    ipcChannel: "app:close-window",
    menuGroup: "Window",
  },

  // ── Workspaces ───────────────────────────────────────────────────────
  {
    action: "new-workspace",
    label: "New Workspace",
    category: "workspaces",
    defaultShortcut: cmd("n"),
    ipcChannel: "app:new-workspace",
    menuGroup: "File",
  },
  {
    action: "close-workspace",
    label: "Close Workspace",
    category: "workspaces",
    defaultShortcut: cmdShift("w"),
    ipcChannel: "app:close-workspace",
    menuGroup: "File",
  },
  {
    action: "rename-workspace",
    label: "Rename Workspace",
    category: "workspaces",
    defaultShortcut: cmdShift("r"),
    ipcChannel: "app:rename-workspace",
    menuGroup: "File",
  },
  {
    action: "next-workspace",
    label: "Next Workspace",
    category: "workspaces",
    defaultShortcut: cmdCtrl("]"),
    ipcChannel: "app:next-workspace",
    menuGroup: "File",
  },
  {
    action: "prev-workspace",
    label: "Previous Workspace",
    category: "workspaces",
    defaultShortcut: cmdCtrl("["),
    ipcChannel: "app:prev-workspace",
    menuGroup: "File",
  },
  // Cmd+1-9 = select workspace by number
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(
    (n): ShortcutDefinition => ({
      action: `select-workspace-${n}` as ShortcutAction,
      label: `Select Workspace ${n}`,
      category: "workspaces",
      defaultShortcut: cmd(String(n)),
      ipcChannel: "app:select-workspace",
      hidden: true,
      numbered: true,
      menuGroup: "View",
    }),
  ),

  // ── Tabs ─────────────────────────────────────────────────────────────
  {
    action: "new-tab",
    label: "New Tab",
    category: "tabs",
    defaultShortcut: cmd("t"),
    ipcChannel: "app:new-tab",
    menuGroup: "File",
  },
  {
    action: "close-tab",
    label: "Close Tab",
    category: "tabs",
    defaultShortcut: cmd("w"),
    ipcChannel: "app:close-tab",
    menuGroup: "File",
  },
  {
    action: "next-tab",
    label: "Next Tab",
    category: "tabs",
    defaultShortcut: cmdShift("]"),
    ipcChannel: "app:next-tab",
    menuGroup: "View",
  },
  {
    action: "prev-tab",
    label: "Previous Tab",
    category: "tabs",
    defaultShortcut: cmdShift("["),
    ipcChannel: "app:prev-tab",
    menuGroup: "View",
  },
  {
    action: "recent-tab",
    label: "Recent Tab",
    category: "tabs",
    defaultShortcut: ctrl("tab"),
    ipcChannel: "app:recent-tab",
    menuGroup: "View",
  },
  {
    action: "recent-tab-reverse",
    label: "Recent Tab Backward",
    category: "tabs",
    defaultShortcut: { key: "tab", command: false, shift: true, option: false, control: true },
    ipcChannel: "app:recent-tab-reverse",
    menuGroup: "View",
  },
  {
    action: "rename-tab",
    label: "Rename Tab",
    category: "tabs",
    defaultShortcut: cmdShift("t"),
    ipcChannel: "app:rename-tab",
    menuGroup: "File",
  },
  // Ctrl+1-9 = select tab by number
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(
    (n): ShortcutDefinition => ({
      action: `select-tab-${n}` as ShortcutAction,
      label: `Select Tab ${n}`,
      category: "tabs",
      defaultShortcut: ctrl(String(n)),
      ipcChannel: "app:select-tab",
      hidden: true,
      numbered: true,
      menuGroup: "View",
    }),
  ),

  // ── Panes ────────────────────────────────────────────────────────────
  {
    action: "split-right",
    label: "Split Right",
    category: "panes",
    defaultShortcut: cmd("d"),
    ipcChannel: "app:split-right",
    menuGroup: "View",
  },
  {
    action: "split-down",
    label: "Split Down",
    category: "panes",
    defaultShortcut: cmdShift("d"),
    ipcChannel: "app:split-down",
    menuGroup: "View",
  },
  {
    action: "focus-pane-left",
    label: "Focus Pane Left",
    category: "panes",
    defaultShortcut: cmdOpt("arrowleft"),
    ipcChannel: "app:focus-pane-left",
    menuGroup: "View",
  },
  {
    action: "focus-pane-right",
    label: "Focus Pane Right",
    category: "panes",
    defaultShortcut: cmdOpt("arrowright"),
    ipcChannel: "app:focus-pane-right",
    menuGroup: "View",
  },
  {
    action: "focus-pane-up",
    label: "Focus Pane Up",
    category: "panes",
    defaultShortcut: cmdOpt("arrowup"),
    ipcChannel: "app:focus-pane-up",
    menuGroup: "View",
  },
  {
    action: "focus-pane-down",
    label: "Focus Pane Down",
    category: "panes",
    defaultShortcut: cmdOpt("arrowdown"),
    ipcChannel: "app:focus-pane-down",
    menuGroup: "View",
  },
  {
    action: "toggle-pane-zoom",
    label: "Toggle Pane Zoom",
    category: "panes",
    defaultShortcut: cmdShift("enter"),
    ipcChannel: "app:toggle-pane-zoom",
    menuGroup: "View",
  },

  // ── Terminal ─────────────────────────────────────────────────────────
  // Context-sensitive: when terminal focused, these zoom terminal font.
  // When browser focused, they zoom the browser instead.
  {
    action: "terminal-zoom-in",
    label: "Zoom In",
    category: "terminal",
    defaultShortcut: cmd("="),
    ipcChannel: "app:zoom-in",
    menuGroup: "View",
  },
  {
    action: "terminal-zoom-out",
    label: "Zoom Out",
    category: "terminal",
    defaultShortcut: cmd("-"),
    ipcChannel: "app:zoom-out",
    menuGroup: "View",
  },
  {
    action: "terminal-zoom-reset",
    label: "Reset Zoom",
    category: "terminal",
    defaultShortcut: cmd("0"),
    ipcChannel: "app:zoom-reset",
    menuGroup: "View",
  },

  // ── Browser ──────────────────────────────────────────────────────────
  {
    action: "browser-focus-url",
    label: "Focus Address Bar",
    category: "browser",
    defaultShortcut: cmd("l"),
    ipcChannel: "app:browser-focus-url",
    menuGroup: "Browser",
  },
  {
    action: "browser-reload",
    label: "Reload Page",
    category: "browser",
    defaultShortcut: cmd("r"),
    ipcChannel: "app:browser-reload",
    menuGroup: "Browser",
  },
  {
    action: "browser-back",
    label: "Back",
    category: "browser",
    defaultShortcut: cmd("["),
    ipcChannel: "app:browser-back",
    menuGroup: "Browser",
  },
  {
    action: "browser-forward",
    label: "Forward",
    category: "browser",
    defaultShortcut: cmd("]"),
    ipcChannel: "app:browser-forward",
    menuGroup: "Browser",
  },
  {
    action: "browser-find",
    label: "Find",
    category: "browser",
    defaultShortcut: cmd("f"),
    ipcChannel: "app:browser-find",
    menuGroup: "Browser",
  },
  {
    action: "browser-zoom-in",
    label: "Browser Zoom In",
    category: "browser",
    defaultShortcut: cmdShift("="),
    ipcChannel: "app:browser-zoom-in",
    menuGroup: "Browser",
    hidden: true,
  },
  {
    action: "browser-zoom-out",
    label: "Browser Zoom Out",
    category: "browser",
    defaultShortcut: cmdShift("-"),
    ipcChannel: "app:browser-zoom-out",
    menuGroup: "Browser",
    hidden: true,
  },
  {
    action: "browser-zoom-reset",
    label: "Browser Zoom Reset",
    category: "browser",
    defaultShortcut: cmdShift("0"),
    ipcChannel: "app:browser-zoom-reset",
    menuGroup: "Browser",
    hidden: true,
  },
  {
    action: "browser-devtools",
    label: "Developer Tools",
    category: "browser",
    defaultShortcut: cmdOpt("i"),
    ipcChannel: "app:browser-devtools",
    menuGroup: "Browser",
  },
  {
    action: "open-browser",
    label: "Open Browser",
    category: "browser",
    defaultShortcut: cmdShift("l"),
    ipcChannel: "app:open-browser",
    menuGroup: "Browser",
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from action ID to its definition for O(1) lookup. */
export const SHORTCUT_MAP: ReadonlyMap<ShortcutAction, ShortcutDefinition> = new Map(
  DEFAULT_SHORTCUTS.map((d) => [d.action, d]),
);

/** Get the definition for a given action. */
export function getShortcutDefinition(action: ShortcutAction): ShortcutDefinition | undefined {
  return SHORTCUT_MAP.get(action);
}

/** All categories in display order. */
export const SHORTCUT_CATEGORIES: readonly { id: ShortcutCategory; label: string }[] = [
  { id: "general", label: "General" },
  { id: "workspaces", label: "Workspaces" },
  { id: "tabs", label: "Tabs" },
  { id: "panes", label: "Panes" },
  { id: "terminal", label: "Terminal" },
  { id: "browser", label: "Browser" },
];

/** Get all shortcut definitions for a category. */
export function getShortcutsForCategory(category: ShortcutCategory): ShortcutDefinition[] {
  return DEFAULT_SHORTCUTS.filter((d) => d.category === category);
}

/** Get all non-hidden shortcuts for a category (for settings UI). */
export function getVisibleShortcutsForCategory(category: ShortcutCategory): ShortcutDefinition[] {
  return DEFAULT_SHORTCUTS.filter((d) => d.category === category && !d.hidden);
}

// ---------------------------------------------------------------------------
// Conversion: StoredShortcut → Electron accelerator string
// ---------------------------------------------------------------------------

/** Map from our key names to Electron accelerator key names. */
const ELECTRON_KEY_MAP: Record<string, string> = {
  enter: "Return",
  tab: "Tab",
  escape: "Escape",
  space: "Space",
  delete: "Delete",
  backspace: "Backspace",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  f1: "F1",
  f2: "F2",
  f3: "F3",
  f4: "F4",
  f5: "F5",
  f6: "F6",
  f7: "F7",
  f8: "F8",
  f9: "F9",
  f10: "F10",
  f11: "F11",
  f12: "F12",
  ",": ",",
  ".": ".",
  "/": "/",
  "\\": "\\",
  "'": "'",
  ";": ";",
  "=": "=",
  "-": "-",
  "[": "[",
  "]": "]",
  "`": "`",
};

/** Convert a StoredShortcut to an Electron accelerator string.
 *  e.g. { key: "d", command: true, shift: true } → "Cmd+Shift+D" */
export function toElectronAccelerator(shortcut: StoredShortcut): string {
  const parts: string[] = [];
  if (shortcut.control) parts.push("Ctrl");
  if (shortcut.option) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.command) parts.push("Cmd");

  const electronKey = ELECTRON_KEY_MAP[shortcut.key] ?? shortcut.key.toUpperCase();
  parts.push(electronKey);

  return parts.join("+");
}

// ---------------------------------------------------------------------------
// Conversion: StoredShortcut → macOS display string with glyphs
// ---------------------------------------------------------------------------

/** Map from our key names to macOS display glyphs. */
const DISPLAY_KEY_MAP: Record<string, string> = {
  enter: "↩",
  tab: "⇥",
  escape: "⎋",
  space: "␣",
  delete: "⌦",
  backspace: "⌫",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  f1: "F1",
  f2: "F2",
  f3: "F3",
  f4: "F4",
  f5: "F5",
  f6: "F6",
  f7: "F7",
  f8: "F8",
  f9: "F9",
  f10: "F10",
  f11: "F11",
  f12: "F12",
};

/** Convert a StoredShortcut to a macOS-style display string.
 *  e.g. { key: "d", command: true, shift: true } → "⇧⌘D"
 *  Modifier order follows macOS convention: ⌃ ⌥ ⇧ ⌘ */
export function toDisplayString(shortcut: StoredShortcut): string {
  let str = "";
  if (shortcut.control) str += "⌃";
  if (shortcut.option) str += "⌥";
  if (shortcut.shift) str += "⇧";
  if (shortcut.command) str += "⌘";

  const displayKey = DISPLAY_KEY_MAP[shortcut.key] ?? shortcut.key.toUpperCase();
  str += displayKey;

  return str;
}

/** Get just the modifier display string (no key). */
export function toModifierDisplayString(shortcut: StoredShortcut): string {
  let str = "";
  if (shortcut.control) str += "⌃";
  if (shortcut.option) str += "⌥";
  if (shortcut.shift) str += "⇧";
  if (shortcut.command) str += "⌘";
  return str;
}

/** Get just the key display string (no modifiers). */
export function toKeyDisplayString(shortcut: StoredShortcut): string {
  return DISPLAY_KEY_MAP[shortcut.key] ?? shortcut.key.toUpperCase();
}

// ---------------------------------------------------------------------------
// Conversion: DOM KeyboardEvent → StoredShortcut (for the recorder)
// ---------------------------------------------------------------------------

/** Map from DOM event.key to our normalized key names. */
const DOM_KEY_MAP: Record<string, string> = {
  Enter: "enter",
  Tab: "tab",
  Escape: "escape",
  " ": "space",
  Delete: "delete",
  Backspace: "backspace",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  F1: "f1",
  F2: "f2",
  F3: "f3",
  F4: "f4",
  F5: "f5",
  F6: "f6",
  F7: "f7",
  F8: "f8",
  F9: "f9",
  F10: "f10",
  F11: "f11",
  F12: "f12",
};

/** Minimal shape of a keyboard event (works without DOM lib). */
export interface KeyboardEventLike {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
}

/** Convert a DOM KeyboardEvent (or KeyboardEventLike) into a StoredShortcut.
 *  Returns null if the event is a bare modifier key press (Shift, Ctrl, etc.). */
export function fromKeyboardEvent(e: KeyboardEventLike): StoredShortcut | null {
  // Ignore bare modifier presses
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) {
    return null;
  }

  const key = DOM_KEY_MAP[e.key] ?? e.key.toLowerCase();

  return {
    key,
    command: e.metaKey,
    shift: e.shiftKey,
    option: e.altKey,
    control: e.ctrlKey,
  };
}

// ---------------------------------------------------------------------------
// Conversion: StoredShortcut → native bridge format
// ---------------------------------------------------------------------------

/** Format sent to the native bridge's setReservedShortcuts().
 *  Uses macOS keyCode-independent representation. */
export interface NativeBridgeShortcut {
  key: string;
  command: boolean;
  shift: boolean;
  option: boolean;
  control: boolean;
}

/** Convert a StoredShortcut to native bridge format. */
export function toNativeBridgeFormat(shortcut: StoredShortcut): NativeBridgeShortcut {
  return {
    key: shortcut.key,
    command: shortcut.command,
    shift: shortcut.shift,
    option: shortcut.option,
    control: shortcut.control,
  };
}

/** Get all shortcuts in native bridge format. Used to sync the reserved list. */
export function getAllNativeBridgeShortcuts(
  overrides?: ReadonlyMap<ShortcutAction, StoredShortcut>,
): NativeBridgeShortcut[] {
  return DEFAULT_SHORTCUTS.map((def) => {
    const shortcut = overrides?.get(def.action) ?? def.defaultShortcut;
    return toNativeBridgeFormat(shortcut);
  });
}

// ---------------------------------------------------------------------------
// Shortcut comparison
// ---------------------------------------------------------------------------

/** Check if two shortcuts are equal. */
export function shortcutsEqual(a: StoredShortcut, b: StoredShortcut): boolean {
  return (
    a.key === b.key &&
    a.command === b.command &&
    a.shift === b.shift &&
    a.option === b.option &&
    a.control === b.control
  );
}

/** Find if a shortcut conflicts with any existing action (excluding the given action). */
export function findConflict(
  shortcut: StoredShortcut,
  excludeAction: ShortcutAction,
  overrides?: ReadonlyMap<ShortcutAction, StoredShortcut>,
): ShortcutDefinition | undefined {
  return DEFAULT_SHORTCUTS.find((def) => {
    if (def.action === excludeAction) return false;
    const existing = overrides?.get(def.action) ?? def.defaultShortcut;
    return shortcutsEqual(shortcut, existing);
  });
}

// ---------------------------------------------------------------------------
// Resolve effective shortcut for an action (with user overrides)
// ---------------------------------------------------------------------------

/** Get the effective shortcut for an action, considering user overrides. */
export function resolveShortcut(
  action: ShortcutAction,
  overrides?: ReadonlyMap<ShortcutAction, StoredShortcut>,
): StoredShortcut {
  const override = overrides?.get(action);
  if (override) return override;
  const def = SHORTCUT_MAP.get(action);
  if (!def) throw new Error(`Unknown shortcut action: ${action}`);
  return def.defaultShortcut;
}

/** Get the display string for an action, considering user overrides.
 *  For numbered shortcuts (select-workspace-1..9), returns "⌘1...9" style. */
export function resolveDisplayString(
  action: ShortcutAction,
  overrides?: ReadonlyMap<ShortcutAction, StoredShortcut>,
): string {
  const shortcut = resolveShortcut(action, overrides);
  return toDisplayString(shortcut);
}

/** Get the display string for a numbered group (e.g. "⌘1...9" for workspace selection). */
export function getNumberedGroupDisplayString(
  baseAction: string,
  overrides?: ReadonlyMap<ShortcutAction, StoredShortcut>,
): string {
  const firstAction = `${baseAction}-1` as ShortcutAction;
  const first = resolveShortcut(firstAction, overrides);
  return `${toModifierDisplayString(first)}1...9`;
}

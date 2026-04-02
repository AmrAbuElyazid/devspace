import { shortcutsEqual, type ShortcutAction, type StoredShortcut } from "../../shared/shortcuts";
import type { BrowserPaneKind, BrowserShortcutBinding } from "./browser-types";

export type WebContentsInputEvent = {
  type?: string;
  key?: string;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

const SHIFTED_SYMBOL_KEY_MAP: Record<string, string> = {
  "{": "[",
  "}": "]",
  "+": "=",
  _: "-",
  "<": ",",
  ">": ".",
  "?": "/",
  ":": ";",
  '"': "'",
  "|": "\\",
  "~": "`",
};

const GLOBALLY_OWNED_WEB_SHORTCUT_ACTIONS = new Set<ShortcutAction>([
  "toggle-sidebar",
  "toggle-settings",
  "close-window",
  "new-workspace",
  "close-workspace",
  "rename-workspace",
  "next-workspace",
  "prev-workspace",
  "select-workspace-1",
  "select-workspace-2",
  "select-workspace-3",
  "select-workspace-4",
  "select-workspace-5",
  "select-workspace-6",
  "select-workspace-7",
  "select-workspace-8",
  "select-workspace-9",
  "new-tab",
  "close-tab",
  "next-tab",
  "prev-tab",
  "recent-tab",
  "recent-tab-reverse",
  "select-tab-1",
  "select-tab-2",
  "select-tab-3",
  "select-tab-4",
  "select-tab-5",
  "select-tab-6",
  "select-tab-7",
  "select-tab-8",
  "select-tab-9",
  "rename-tab",
  "split-right",
  "split-down",
  "focus-pane-left",
  "focus-pane-right",
  "focus-pane-up",
  "focus-pane-down",
  "toggle-pane-zoom",
  "terminal-zoom-in",
  "terminal-zoom-out",
  "terminal-zoom-reset",
  "open-browser",
]);

const BROWSER_ONLY_SHORTCUT_ACTIONS = new Set<ShortcutAction>([
  "browser-focus-url",
  "browser-reload",
  "browser-back",
  "browser-forward",
  "browser-find",
  "browser-zoom-in",
  "browser-zoom-out",
  "browser-zoom-reset",
  "browser-devtools",
]);

function getHeldModifier(
  shortcut: Pick<StoredShortcut, "command" | "control">,
): "command" | "control" | null {
  if (shortcut.command) return "command";
  if (shortcut.control) return "control";
  return null;
}

export function resolveNativeModifier(
  input: WebContentsInputEvent,
  shortcut: StoredShortcut | null,
): "command" | "control" | null {
  if (shortcut) {
    return getHeldModifier(shortcut);
  }

  if (input.meta === true) {
    return "command";
  }

  if (input.control === true) {
    return "control";
  }

  return null;
}

export function toStoredShortcut(input: WebContentsInputEvent): StoredShortcut | null {
  if (typeof input.key !== "string") {
    return null;
  }

  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(input.key)) {
    return null;
  }

  const keyMap: Record<string, string> = {
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

  return {
    key: SHIFTED_SYMBOL_KEY_MAP[input.key] ?? keyMap[input.key] ?? input.key.toLowerCase(),
    command: input.meta === true,
    shift: input.shift === true,
    option: input.alt === true,
    control: input.control === true,
  };
}

export function findShortcutBinding(
  bindings: BrowserShortcutBinding[] | undefined,
  kind: BrowserPaneKind,
  shortcut: StoredShortcut,
): BrowserShortcutBinding | undefined {
  return bindings?.find((binding) => {
    if (!shortcutsEqual(binding.shortcut, shortcut)) {
      return false;
    }

    if (GLOBALLY_OWNED_WEB_SHORTCUT_ACTIONS.has(binding.action)) {
      return true;
    }

    return kind === "browser" && BROWSER_ONLY_SHORTCUT_ACTIONS.has(binding.action);
  });
}

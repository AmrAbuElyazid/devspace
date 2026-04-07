import { expect, test } from "vitest";
import {
  findShortcutBinding,
  resolveNativeModifier,
  shouldIgnoreMenuShortcuts,
  toStoredShortcut,
} from "../browser-web-shortcuts";

test("toStoredShortcut normalizes shifted symbol keys to their base shortcut keys", () => {
  expect(
    toStoredShortcut({
      key: "{",
      meta: true,
      shift: true,
      alt: false,
      control: false,
    }),
  ).toEqual({
    key: "[",
    command: true,
    shift: true,
    option: false,
    control: false,
  });
});

test("findShortcutBinding keeps browser-only shortcuts out of editor panes", () => {
  const browserFind = {
    action: "browser-find" as const,
    channel: "app:browser-find" as const,
    shortcut: {
      key: "f",
      command: true,
      shift: false,
      option: false,
      control: false,
    },
  };

  expect(findShortcutBinding([browserFind], "browser", browserFind.shortcut)).toEqual(browserFind);
  expect(findShortcutBinding([browserFind], "editor", browserFind.shortcut)).toBeUndefined();
});

test("findShortcutBinding only keeps close-window app-global for editor panes", () => {
  const closeWindow = {
    action: "close-window" as const,
    channel: "app:close-window" as const,
    shortcut: {
      key: "w",
      command: true,
      shift: false,
      option: false,
      control: true,
    },
  };
  const newTab = {
    action: "new-tab" as const,
    channel: "app:new-tab" as const,
    shortcut: {
      key: "t",
      command: true,
      shift: false,
      option: false,
      control: false,
    },
  };

  expect(findShortcutBinding([closeWindow], "editor", closeWindow.shortcut)).toEqual(closeWindow);
  expect(findShortcutBinding([newTab], "editor", newTab.shortcut)).toBeUndefined();
});

test("shouldIgnoreMenuShortcuts yields command shortcuts to editor panes", () => {
  expect(shouldIgnoreMenuShortcuts("editor", { meta: true, control: false })).toBe(true);
  expect(shouldIgnoreMenuShortcuts("editor", { meta: false, control: true })).toBe(true);
  expect(shouldIgnoreMenuShortcuts("editor", { meta: false, control: false })).toBe(false);
  expect(shouldIgnoreMenuShortcuts("browser", { meta: true, control: false })).toBe(false);
});

test("resolveNativeModifier falls back to the held meta/control key when no shortcut matches", () => {
  expect(resolveNativeModifier({ key: "Meta", meta: true }, null)).toBe("command");
  expect(resolveNativeModifier({ key: "Control", control: true }, null)).toBe("control");
  expect(resolveNativeModifier({ key: "Shift" }, null)).toBeNull();
});

import { expect, test } from "vitest";
import {
  findShortcutBinding,
  resolveNativeModifier,
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

test("resolveNativeModifier falls back to the held meta/control key when no shortcut matches", () => {
  expect(resolveNativeModifier({ key: "Meta", meta: true }, null)).toBe("command");
  expect(resolveNativeModifier({ key: "Control", control: true }, null)).toBe("control");
  expect(resolveNativeModifier({ key: "Shift" }, null)).toBeNull();
});

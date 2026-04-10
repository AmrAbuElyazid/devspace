import { describe, expect, test } from "vitest";
import { buildAppShortcutBindings } from "./app-shortcut-bindings";
import type { ShortcutAction, StoredShortcut } from "../shared/shortcuts";

describe("buildAppShortcutBindings", () => {
  test("returns an empty list when no shortcut store is available", () => {
    expect(buildAppShortcutBindings(null)).toEqual([]);
  });

  test("maps shortcut definitions into browser bindings with numbered args", () => {
    const overrides = new Map<ShortcutAction, StoredShortcut>([
      ["toggle-sidebar", { key: "y", command: true, shift: false, option: false, control: false }],
    ]);

    const bindings = buildAppShortcutBindings({
      getAllOverrides: () => overrides,
    });

    const toggleSidebar = bindings.find((binding) => binding.action === "toggle-sidebar");
    const selectWorkspace = bindings.find((binding) => binding.action === "select-workspace-1");

    expect(toggleSidebar).toMatchObject({
      action: "toggle-sidebar",
      channel: "app:toggle-sidebar",
      shortcut: { key: "y", command: true, shift: false, option: false, control: false },
    });
    expect(selectWorkspace).toMatchObject({
      action: "select-workspace-1",
      channel: "app:select-workspace",
      args: [1],
    });
  });
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSettingsStore } from "./settings-store";

function resetSettingsStore(): void {
  useSettingsStore.setState({
    sidebarOpen: true,
    settingsOpen: false,
    showShortcutHintsOnModifierPress: true,
    fontSize: 13,
    vscodeCliPath: "",
    defaultShell: "",
    terminalScrollback: 5000,
    terminalCursorStyle: "block",
    keepVscodeServerRunning: true,
    sidebarWidth: 220,
    defaultPaneType: "terminal",
    panePickerContext: null,
    overlayCount: 0,
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  localStorage.clear();
  resetSettingsStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("showShortcutHintsOnModifierPress defaults to true", () => {
  expect(useSettingsStore.getState().showShortcutHintsOnModifierPress).toBe(true);
});

test("showShortcutHintsOnModifierPress updates when toggled", () => {
  useSettingsStore.getState().updateSetting("showShortcutHintsOnModifierPress", false);

  expect(useSettingsStore.getState().showShortcutHintsOnModifierPress).toBe(false);
});

test("vscodeCliPath defaults to empty and can be updated", () => {
  expect(useSettingsStore.getState().vscodeCliPath).toBe("");

  useSettingsStore
    .getState()
    .updateSetting(
      "vscodeCliPath",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    );

  expect(useSettingsStore.getState().vscodeCliPath).toBe(
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  );
});

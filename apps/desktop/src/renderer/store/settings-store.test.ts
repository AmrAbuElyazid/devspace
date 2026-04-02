import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSettingsStore } from "./settings-store";

function resetSettingsStore(): void {
  useSettingsStore.setState({
    sidebarOpen: true,
    settingsOpen: false,
    showShortcutHintsOnModifierPress: true,
    fontSize: 13,
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

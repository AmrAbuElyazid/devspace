import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsPage from "./SettingsPage";
import { useSettingsStore } from "../store/settings-store";

test("renders settings as a fixed modal overlay", () => {
  useSettingsStore.setState({
    settingsOpen: true,
    themeMode: "system",
    fontSize: 13,
    showShortcutHintsOnModifierPress: true,
    vscodeCliPath: "",
    defaultShell: "",
    terminalScrollback: 5000,
    terminalCursorStyle: "block",
    keepVscodeServerRunning: true,
  });

  const html = renderToStaticMarkup(<SettingsPage />);

  expect(html).toContain("fixed inset-0 z-50 overflow-y-auto");
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("padding-left:88px");
});

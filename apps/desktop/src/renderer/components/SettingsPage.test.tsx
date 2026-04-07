// @vitest-environment jsdom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SettingsPage from "./SettingsPage";
import { useSettingsStore } from "../store/settings-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  window.api = {
    window: {
      isFullScreen: vi.fn(async () => false),
      onFullScreenChange: vi.fn(() => () => {}),
    },
    editor: {
      getCliStatus: vi.fn(async () => ({
        path: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        source: "bundle",
      })),
    },
    browser: {
      listProfiles: vi.fn(async () => []),
      detectAccess: vi.fn(async () => ({ ok: true })),
      importBrowser: vi.fn(async () => ({ ok: true, importedCookies: 0, importedHistory: 0 })),
      clearBrowsingData: vi.fn(async () => ({ ok: true })),
    },
    shortcuts: {
      getAll: vi.fn(async () => ({})),
      onChanged: vi.fn(() => () => {}),
      set: vi.fn(),
      reset: vi.fn(),
      resetAll: vi.fn(),
    },
  } as unknown as typeof window.api;

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
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
});

test("renders settings as a fixed modal overlay", () => {
  const html = renderToStaticMarkup(<SettingsPage />);

  expect(html).toContain("fixed inset-0 z-50 overflow-y-auto");
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("padding-left:88px");
});

test("shows the resolved VS Code CLI path in settings", async () => {
  await act(async () => {
    root?.render(<SettingsPage />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(container.textContent).toContain(
    "Using /Applications/Visual Studio Code.app/Contents/Resources/app/bin/code (VS Code app bundle)",
  );
});

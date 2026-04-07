// @vitest-environment jsdom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SettingsPage from "./SettingsPage";
import { useSettingsStore } from "../store/settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  installMockWindowApi({
    window: {
      isFullScreen: vi.fn(async () => false),
      onFullScreenChange: vi.fn(() => () => {}),
    },
    editor: {
      getCliStatus: vi.fn(async () => ({
        path: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        source: "bundle" as const,
      })),
    },
  });

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

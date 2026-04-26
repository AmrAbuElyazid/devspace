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
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

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
    leaderTimeoutMs: 2000,
    vscodeCliPath: "",
    defaultShell: "",
    terminalScrollback: 5000,
    terminalCursorStyle: "block",
    keepVscodeServerRunning: false,
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

  expect(html).toContain("fixed inset-0 z-50");
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("padding-left:88px");
});

test("shows the resolved VS Code CLI path in settings", async () => {
  await act(async () => {
    root?.render(<SettingsPage />);
  });

  // Navigate to the Editor section
  const editorNav = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent === "Editor",
  );
  await act(async () => {
    editorNav?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(container.textContent).toContain(
    "Using /Applications/Visual Studio Code.app/Contents/Resources/app/bin/code (VS Code app bundle)",
  );
});

test("does not persist number settings until the value is committed", async () => {
  await act(async () => {
    root?.render(<SettingsPage />);
  });

  // Navigate to the Appearance section where the font size number input lives
  const appearanceNav = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent === "Appearance",
  );
  await act(async () => {
    appearanceNav?.click();
  });

  const input = container.querySelector('input[type="number"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  await act(async () => {
    setInputValue?.call(input, "18");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(useSettingsStore.getState().fontSize).toBe(13);

  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(useSettingsStore.getState().fontSize).toBe(18);
});

test("persists the leader timeout only after the value is committed", async () => {
  await act(async () => {
    root?.render(<SettingsPage />);
  });

  const input = container.querySelector('input[type="number"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.value).toBe("2000");

  await act(async () => {
    setInputValue?.call(input, "2500");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(useSettingsStore.getState().leaderTimeoutMs).toBe(2000);

  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(useSettingsStore.getState().leaderTimeoutMs).toBe(2500);
});

test("does not persist text settings until the value is committed", async () => {
  await act(async () => {
    root?.render(<SettingsPage />);
  });

  // Navigate to the Terminal section where the default shell text input lives
  const terminalNav = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent === "Terminal",
  );
  await act(async () => {
    terminalNav?.click();
  });

  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  await act(async () => {
    setInputValue?.call(input, "/bin/zsh");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(useSettingsStore.getState().defaultShell).toBe("");

  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(useSettingsStore.getState().defaultShell).toBe("/bin/zsh");
});

test("shows a friendly private-release updater message and wraps the status text", async () => {
  const privateReleaseMessage =
    "Automatic updates aren't available for private GitHub releases in this build. Use View Releases to download the latest version manually.";

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
    app: {
      getUpdateState: vi.fn(async () => ({
        enabled: false,
        status: "disabled" as const,
        currentVersion: "0.1.0",
        availableVersion: null,
        checkedAt: "2026-04-26T05:30:00.000Z",
        downloadPercent: null,
        message: null,
        disabledReason: privateReleaseMessage,
      })),
      onUpdateStateChanged: vi.fn(() => () => {}),
    },
  });

  await act(async () => {
    root?.render(<SettingsPage />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(container.textContent).toContain(privateReleaseMessage);

  const checkButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Check for Updates",
  );
  expect(checkButton?.hasAttribute("disabled")).toBe(true);

  const statusText = Array.from(container.querySelectorAll("span")).find(
    (span) => span.textContent === privateReleaseMessage,
  );
  expect(statusText?.className).toContain("break-words");
  expect(statusText?.style.overflowWrap).toBe("anywhere");
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTheme } from "./useTheme";
import { useSettingsStore } from "../store/settings-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;
let prefersDark = false;
let mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

function ThemeProbe() {
  useTheme();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  prefersDark = false;
  mediaListeners = new Set();
  document.documentElement.classList.remove("dark");

  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return prefersDark;
    },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.delete(listener);
    },
  })) as typeof window.matchMedia;

  useSettingsStore.setState({ themeMode: "system" });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
  document.documentElement.classList.remove("dark");
});

test("system mode follows the OS preference and reacts to changes", async () => {
  prefersDark = true;

  await act(async () => {
    root?.render(<ThemeProbe />);
  });

  expect(document.documentElement.classList.contains("dark")).toBe(true);

  await act(async () => {
    prefersDark = false;
    for (const listener of mediaListeners) {
      listener({ matches: false } as MediaQueryListEvent);
    }
  });

  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("explicit dark and light modes override the OS preference", async () => {
  prefersDark = false;

  await act(async () => {
    root?.render(<ThemeProbe />);
  });

  await act(async () => {
    useSettingsStore.getState().updateSetting("themeMode", "dark");
  });

  expect(document.documentElement.classList.contains("dark")).toBe(true);

  await act(async () => {
    prefersDark = true;
    for (const listener of mediaListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
  });

  expect(document.documentElement.classList.contains("dark")).toBe(true);

  await act(async () => {
    useSettingsStore.getState().updateSetting("themeMode", "light");
  });

  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

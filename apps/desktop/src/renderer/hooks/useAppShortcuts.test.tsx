// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useAppShortcuts } from "./useAppShortcuts";
import { resetAppShortcutCaptureState } from "./app-shortcut-actions";
import { useSettingsStore } from "../store/settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import { useNativeViewStore } from "../store/native-view-store";
import { useWorkspaceStore } from "../store/workspace-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appShortcutMocks = vi.hoisted(() => ({
  onAction: vi.fn(),
  closeWindow: vi.fn(),
}));

function ShortcutProbe() {
  useAppShortcuts();
  return null;
}

let container: HTMLDivElement;
let root: Root | null;
let actionHandler: ((channel: string, ...args: unknown[]) => void) | null;

beforeEach(() => {
  localStorage.clear();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  globalThis.cancelAnimationFrame = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  actionHandler = null;

  appShortcutMocks.onAction.mockReset();
  appShortcutMocks.onAction.mockImplementation(
    (handler: (channel: string, ...args: unknown[]) => void) => {
      actionHandler = handler;
      return () => {};
    },
  );
  appShortcutMocks.closeWindow.mockReset();

  installMockWindowApi({
    app: {
      onAction: appShortcutMocks.onAction,
    },
    window: {
      close: appShortcutMocks.closeWindow,
    },
  });

  useSettingsStore.setState({
    settingsOpen: true,
    sidebarOpen: true,
    overlayCount: 0,
  });

  useNativeViewStore.setState({
    views: {
      "browser-1": "browser",
    },
    visibleTerminals: [],
    visibleBrowsers: ["browser-1"],
    dragHidesViews: false,
    temporarilyHiddenPaneId: null,
  });

  resetAppShortcutCaptureState();

  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace One",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
      {
        id: "workspace-2",
        name: "Workspace Two",
        root: { type: "leaf", groupId: "group-2" },
        focusedGroupId: "group-2",
        zoomedGroupId: null,
        lastActiveAt: 2,
      },
    ],
    activeWorkspaceId: "workspace-1",
    panes: {
      "browser-1": {
        id: "browser-1",
        title: "Browser",
        type: "browser",
        config: { url: "https://example.com" },
      },
      "note-1": {
        id: "note-1",
        title: "Note",
        type: "note",
        config: { noteId: "note-1" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "browser-1" }],
      },
      "group-2": {
        id: "group-2",
        activeTabId: "tab-2",
        tabs: [{ id: "tab-2", paneId: "note-1" }],
      },
    },
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

test("navigation shortcuts close settings before changing workspace", async () => {
  await act(async () => {
    root?.render(<ShortcutProbe />);
  });

  expect(actionHandler).toBeTypeOf("function");

  await act(async () => {
    actionHandler?.("app:next-workspace");
  });

  expect(useSettingsStore.getState().settingsOpen).toBe(false);
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("workspace-2");
});

test("sidebar shortcuts close settings before toggling the sidebar", async () => {
  await act(async () => {
    root?.render(<ShortcutProbe />);
  });

  await act(async () => {
    actionHandler?.("app:toggle-sidebar");
  });

  expect(useSettingsStore.getState().settingsOpen).toBe(false);
  expect(useSettingsStore.getState().sidebarOpen).toBe(false);
});

test("leader hides the active native pane until the next shortcut action", async () => {
  useSettingsStore.setState({ settingsOpen: false });

  await act(async () => {
    root?.render(<ShortcutProbe />);
  });

  await act(async () => {
    actionHandler?.("app:leader");
  });

  expect(useNativeViewStore.getState().temporarilyHiddenPaneId).toBe("browser-1");
  expect(window.api.window.focusContent).toHaveBeenCalledTimes(1);

  await act(async () => {
    actionHandler?.("app:toggle-sidebar");
    await Promise.resolve();
  });

  expect(useNativeViewStore.getState().temporarilyHiddenPaneId).toBeNull();
  expect(useSettingsStore.getState().sidebarOpen).toBe(false);
  expect(window.api.browser.setFocus).toHaveBeenCalledWith("browser-1");
});

test("escape cancels leader capture and restores native focus", async () => {
  useSettingsStore.setState({ settingsOpen: false });

  await act(async () => {
    root?.render(<ShortcutProbe />);
  });

  await act(async () => {
    actionHandler?.("app:leader");
  });

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await Promise.resolve();
  });

  expect(useNativeViewStore.getState().temporarilyHiddenPaneId).toBeNull();
  expect(window.api.browser.setFocus).toHaveBeenCalledWith("browser-1");
});

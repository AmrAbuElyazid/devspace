// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useAppShortcuts } from "./useAppShortcuts";
import { useSettingsStore } from "../store/settings-store";
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

  window.api = {
    app: {
      onAction: appShortcutMocks.onAction,
    },
    window: {
      close: appShortcutMocks.closeWindow,
    },
  } as unknown as typeof window.api;

  useSettingsStore.setState({
    settingsOpen: true,
    sidebarOpen: true,
    overlayCount: 0,
  });

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

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTerminalEvents } from "./useTerminalEvents";
import { useWorkspaceStore } from "../store/workspace-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminalEventsMocks = vi.hoisted(() => ({
  syncWorkspaceFocusForNativeNotification: vi.fn(),
  focusActiveNativePane: vi.fn(),
  focusedHandler: null as null | ((surfaceId: string) => void),
  pwdHandler: null as null | ((surfaceId: string, pwd: string) => void),
  terminalOnFocused: vi.fn((callback: (surfaceId: string) => void) => {
    terminalEventsMocks.focusedHandler = callback;
    return () => {};
  }),
  terminalOnPwdChanged: vi.fn((callback: (surfaceId: string, pwd: string) => void) => {
    terminalEventsMocks.pwdHandler = callback;
    return () => {};
  }),
}));

vi.mock("../lib/native-pane-focus", () => ({
  syncWorkspaceFocusForNativeNotification:
    terminalEventsMocks.syncWorkspaceFocusForNativeNotification,
  focusActiveNativePane: terminalEventsMocks.focusActiveNativePane,
}));

function HookHarness() {
  useTerminalEvents();
  return null;
}

let container: HTMLDivElement;
let root: Root | null;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  terminalEventsMocks.syncWorkspaceFocusForNativeNotification.mockReset();
  terminalEventsMocks.focusActiveNativePane.mockReset();
  terminalEventsMocks.focusedHandler = null;
  terminalEventsMocks.pwdHandler = null;
  terminalEventsMocks.terminalOnFocused.mockClear();
  terminalEventsMocks.terminalOnPwdChanged.mockClear();

  installMockWindowApi({
    terminal: {
      onFocused: terminalEventsMocks.terminalOnFocused,
      onPwdChanged: terminalEventsMocks.terminalOnPwdChanged,
    },
  });

  await act(async () => {
    root?.render(<HookHarness />);
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

test("terminal focus events sync the owning pane activation", async () => {
  expect(terminalEventsMocks.focusedHandler).toBeTypeOf("function");

  await act(async () => {
    terminalEventsMocks.focusedHandler?.("surface-2");
  });

  expect(terminalEventsMocks.syncWorkspaceFocusForNativeNotification).toHaveBeenCalledWith(
    "surface-2",
  );
});

test("empty terminal pwd events are ignored", async () => {
  const updatePaneConfig = vi.spyOn(useWorkspaceStore.getState(), "updatePaneConfig");
  expect(terminalEventsMocks.pwdHandler).toBeTypeOf("function");

  await act(async () => {
    terminalEventsMocks.pwdHandler?.("surface-1", "");
  });

  expect(updatePaneConfig).not.toHaveBeenCalled();
});

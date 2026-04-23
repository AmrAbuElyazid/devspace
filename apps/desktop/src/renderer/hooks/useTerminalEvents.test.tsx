// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTerminalEvents } from "./useTerminalEvents";
import { installMockWindowApi } from "../test-utils/mock-window-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminalEventsMocks = vi.hoisted(() => ({
  syncWorkspaceFocusForPane: vi.fn(),
  focusActiveNativePane: vi.fn(),
  focusedHandler: null as null | ((surfaceId: string) => void),
  terminalOnFocused: vi.fn((callback: (surfaceId: string) => void) => {
    terminalEventsMocks.focusedHandler = callback;
    return () => {};
  }),
}));

vi.mock("../lib/native-pane-focus", () => ({
  syncWorkspaceFocusForPane: terminalEventsMocks.syncWorkspaceFocusForPane,
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

  terminalEventsMocks.syncWorkspaceFocusForPane.mockReset();
  terminalEventsMocks.focusActiveNativePane.mockReset();
  terminalEventsMocks.focusedHandler = null;
  terminalEventsMocks.terminalOnFocused.mockClear();

  installMockWindowApi({
    terminal: {
      onFocused: terminalEventsMocks.terminalOnFocused,
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

  expect(terminalEventsMocks.syncWorkspaceFocusForPane).toHaveBeenCalledWith("surface-2");
});

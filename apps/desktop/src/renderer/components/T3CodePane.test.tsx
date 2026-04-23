// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import T3CodePane, { markT3CodeDestroyed } from "./T3CodePane";

const t3CodePaneMocks = vi.hoisted(() => ({
  useNativeView: vi.fn(),
  browserSetFocus: vi.fn(),
  isAvailable: vi.fn(),
  start: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../hooks/useNativeView", () => ({
  useNativeView: (args: unknown) => t3CodePaneMocks.useNativeView(args),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  t3CodePaneMocks.useNativeView.mockReset();
  t3CodePaneMocks.useNativeView.mockReturnValue({ isVisible: true });
  t3CodePaneMocks.browserSetFocus.mockReset();
  t3CodePaneMocks.isAvailable.mockReset();
  t3CodePaneMocks.isAvailable.mockResolvedValue(true);
  t3CodePaneMocks.start.mockReset();
  t3CodePaneMocks.start.mockResolvedValue({ url: "http://127.0.0.1:3001" });

  installMockWindowApi({
    browser: {
      setFocus: t3CodePaneMocks.browserSetFocus,
    },
    t3code: {
      isAvailable: t3CodePaneMocks.isAvailable,
      start: t3CodePaneMocks.start,
    },
  });
});

afterEach(async () => {
  markT3CodeDestroyed("pane-1");

  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
});

async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

test("focuses the native t3code view when an already-visible pane becomes focused", async () => {
  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={false} />);
  });

  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(t3CodePaneMocks.start).toHaveBeenCalledWith("pane-1");
  expect(t3CodePaneMocks.browserSetFocus).not.toHaveBeenCalled();

  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });

  expect(t3CodePaneMocks.browserSetFocus).toHaveBeenCalledTimes(1);
  expect(t3CodePaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1");
});

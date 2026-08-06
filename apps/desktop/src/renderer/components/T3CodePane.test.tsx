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
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  markT3CodeDestroyed("pane-1");

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
  expect(t3CodePaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
});

test("a pane that comes back on its own asks for focus reactively", async () => {
  // The view is rebuilt after an eviction and reaches "running" with nobody
  // having asked for it. Marking that reactive is what lets main refuse to
  // activate the app for it.
  t3CodePaneMocks.useNativeView.mockImplementation((args: unknown) => ({
    isVisible: Boolean((args as { enabled?: boolean }).enabled),
  }));

  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });
  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(t3CodePaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1", "reactive");
});

test("surfaces a pending T3 start failure after the pane remounts", async () => {
  let resolveStart: ((value: { error: string }) => void) | null = null;
  t3CodePaneMocks.start.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );

  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });
  await flushAsyncEffects();
  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(1);

  await act(async () => {
    root?.unmount();
    root = null;
  });
  root = createRoot(container);
  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });

  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveStart?.({ error: "t3 failed" });
    await Promise.resolve();
  });

  expect(container.textContent).toContain("Failed to start");
  expect(container.textContent).toContain("t3 failed");
});

test("an inactive pane does not rebuild the view its eviction just reclaimed", async () => {
  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });
  await flushAsyncEffects();
  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(1);

  // Deactivating and then evicting drops the pane back to "starting". While it
  // is off screen that must not trigger another start, or the pane and the
  // warm-view budget fight each other forever.
  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={false} isActive={false} />);
  });
  await act(async () => {
    markT3CodeDestroyed("pane-1");
  });
  await flushAsyncEffects();

  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(1);

  // Coming back on screen restarts it.
  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} isActive={true} />);
  });
  await flushAsyncEffects();

  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(2);
});

test("a superseded start is not shown as a failure, and the pane starts over", async () => {
  t3CodePaneMocks.start.mockResolvedValueOnce({ cancelled: true });

  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });
  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(container.textContent).not.toContain("Failed to start");
  expect(container.textContent).not.toContain("cancelled");
  expect(t3CodePaneMocks.start).toHaveBeenCalledTimes(2);
});

test("a rejected start invoke shows the error instead of spinning forever", async () => {
  t3CodePaneMocks.start.mockRejectedValue(new Error("IPC channel closed"));

  await act(async () => {
    root?.render(<T3CodePane paneId="pane-1" isFocused={true} />);
  });
  await flushAsyncEffects();

  expect(container.textContent).toContain("Failed to start");
  expect(container.textContent).toContain("IPC channel closed");
});

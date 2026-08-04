// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useBrowserViewportResize } from "./useBrowserViewportResize";
import type { BrowserViewportSetting } from "../lib/browser-viewport";

const PANEL = { width: 1200, height: 900 };
const DEVICE: BrowserViewportSetting = { kind: "device", width: 400, height: 800 };

type Hook = ReturnType<typeof useBrowserViewportResize>;

let container: HTMLDivElement;
let root: Root;
let latest: Hook;

function renderResize(options?: {
  viewport?: BrowserViewportSetting;
  aspectRatio?: number | null;
  onCommit?: (next: BrowserViewportSetting) => void;
}): { onCommit: (next: BrowserViewportSetting) => void } {
  const onCommit = options?.onCommit ?? vi.fn();

  function Harness(): null {
    latest = useBrowserViewportResize({
      viewport: options?.viewport ?? DEVICE,
      panel: PANEL,
      renderScale: 1,
      aspectRatio: options?.aspectRatio ?? null,
      onCommit,
    });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return { onCommit };
}

function startDrag(direction: "east" | "west" | "south" | "southeast" | "southwest"): void {
  act(() => {
    latest.handleResizePointerDown(direction, {
      pointerId: 1,
      clientX: 500,
      clientY: 300,
      currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as never);
  });
}

function dispatchPointer(type: string, clientX: number, clientY: number): void {
  act(() => {
    const event = new Event(type);
    Object.assign(event, { pointerId: 1, clientX, clientY });
    window.dispatchEvent(event);
  });
}

function pressArrow(direction: "east" | "south", key: string, shiftKey = false): void {
  act(() => {
    latest.handleResizeKeyDown(direction, {
      key,
      shiftKey,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as never);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

test("a pointer drag previews locally and commits only on release", () => {
  const { onCommit } = renderResize();

  startDrag("east");
  dispatchPointer("pointermove", 550, 300);

  // The frame is centered, so 50px of pointer travel is 100px of width.
  expect(latest.effectiveViewport).toEqual({ kind: "device", width: 500, height: 800 });
  expect(onCommit).not.toHaveBeenCalled();

  dispatchPointer("pointerup", 550, 300);

  expect(onCommit).toHaveBeenCalledWith({ kind: "device", width: 500, height: 800 });
});

test("a drag that ends where it started commits nothing", () => {
  const { onCommit } = renderResize();

  startDrag("east");
  dispatchPointer("pointerup", 500, 300);

  expect(onCommit).not.toHaveBeenCalled();
});

test("a cancelled drag discards its preview", () => {
  const { onCommit } = renderResize();

  startDrag("east");
  dispatchPointer("pointermove", 600, 300);
  dispatchPointer("pointercancel", 600, 300);

  expect(onCommit).not.toHaveBeenCalled();
  expect(latest.effectiveViewport).toEqual(DEVICE);
  expect(latest.activeDrag).toBeNull();
});

test("arrow keys resize and commit once the repeats settle", () => {
  const { onCommit } = renderResize();

  pressArrow("east", "ArrowRight");

  expect(latest.effectiveViewport).toEqual({ kind: "device", width: 410, height: 800 });
  expect(onCommit).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(150);
  });

  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith({ kind: "device", width: 410, height: 800 });
});

test("held arrow repeats accumulate into a single commit", () => {
  const { onCommit } = renderResize();

  pressArrow("east", "ArrowRight");
  pressArrow("east", "ArrowRight");
  pressArrow("east", "ArrowRight");
  act(() => {
    vi.advanceTimersByTime(150);
  });

  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith({ kind: "device", width: 430, height: 800 });
});

test("shift takes a coarser step", () => {
  renderResize();

  pressArrow("east", "ArrowRight", true);

  expect(latest.effectiveViewport).toEqual({ kind: "device", width: 450, height: 800 });
});

test("an arrow key the handle does not control is ignored", () => {
  const { onCommit } = renderResize();

  pressArrow("east", "ArrowDown");
  act(() => {
    vi.advanceTimersByTime(150);
  });

  expect(onCommit).not.toHaveBeenCalled();
  expect(latest.effectiveViewport).toEqual(DEVICE);
});

test("fill mode ignores resize input entirely", () => {
  const { onCommit } = renderResize({ viewport: { kind: "fill" } });

  startDrag("east");
  dispatchPointer("pointermove", 600, 300);
  dispatchPointer("pointerup", 600, 300);

  expect(onCommit).not.toHaveBeenCalled();
  expect(latest.effectiveViewport).toEqual({ kind: "fill" });
});

test("a locked aspect ratio is honoured while dragging", () => {
  renderResize({ aspectRatio: 0.5 });

  startDrag("east");
  dispatchPointer("pointermove", 550, 300);

  expect(latest.effectiveViewport).toEqual({ kind: "device", width: 500, height: 1000 });
});

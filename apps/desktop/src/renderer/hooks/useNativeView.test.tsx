// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useNativeView } from "./useNativeView";

const nativeViewMocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  setNativeViewElement: vi.fn(),
  updateNativeViewBounds: vi.fn(),
  clearNativeViewBounds: vi.fn(),
  visibleTerminals: ["pane-1"] as string[],
  visibleBrowsers: [] as string[],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../store/native-view-store", () => ({
  useNativeViewStore: (
    selector: (state: {
      register: typeof nativeViewMocks.register;
      unregister: typeof nativeViewMocks.unregister;
      visibleTerminals: string[];
      visibleBrowsers: string[];
    }) => unknown,
  ) =>
    selector({
      register: nativeViewMocks.register,
      unregister: nativeViewMocks.unregister,
      visibleTerminals: nativeViewMocks.visibleTerminals,
      visibleBrowsers: nativeViewMocks.visibleBrowsers,
    }),
  setNativeViewElement: nativeViewMocks.setNativeViewElement,
  updateNativeViewBounds: nativeViewMocks.updateNativeViewBounds,
  clearNativeViewBounds: nativeViewMocks.clearNativeViewBounds,
}));

function TestNativeView({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useNativeView({ id: "pane-1", type: "terminal", ref, enabled });
  return <div ref={ref} />;
}

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  nativeViewMocks.register.mockReset();
  nativeViewMocks.unregister.mockReset();
  nativeViewMocks.setNativeViewElement.mockReset();
  nativeViewMocks.updateNativeViewBounds.mockReset();
  nativeViewMocks.clearNativeViewBounds.mockReset();
  nativeViewMocks.visibleTerminals = ["pane-1"];
  nativeViewMocks.visibleBrowsers = [];

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 300,
    height: 160,
    right: 310,
    bottom: 180,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
  vi.restoreAllMocks();
});

test("registers the native view, primes bounds, and cleans up on unmount", async () => {
  await act(async () => {
    root?.render(<TestNativeView />);
  });

  const placeholder = container.firstElementChild;
  expect(placeholder).toBeTruthy();

  expect(nativeViewMocks.setNativeViewElement).toHaveBeenNthCalledWith(1, "pane-1", placeholder);
  expect(nativeViewMocks.updateNativeViewBounds).toHaveBeenCalledWith("pane-1", {
    x: 10,
    y: 20,
    width: 300,
    height: 160,
  });
  expect(nativeViewMocks.register).toHaveBeenCalledWith("pane-1", "terminal");

  await act(async () => {
    root?.unmount();
    root = null;
  });

  expect(nativeViewMocks.unregister).toHaveBeenCalledWith("pane-1");
  expect(nativeViewMocks.setNativeViewElement).toHaveBeenLastCalledWith("pane-1", null);
  expect(nativeViewMocks.clearNativeViewBounds).toHaveBeenCalledWith("pane-1");
});

test("does not register or measure when disabled", async () => {
  await act(async () => {
    root?.render(<TestNativeView enabled={false} />);
  });

  expect(nativeViewMocks.setNativeViewElement).not.toHaveBeenCalled();
  expect(nativeViewMocks.updateNativeViewBounds).not.toHaveBeenCalled();
  expect(nativeViewMocks.register).not.toHaveBeenCalled();
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import TerminalPane from "./TerminalPane";

const terminalPaneMocks = vi.hoisted(() => ({
  useNativeView: vi.fn(),
  closeFindBar: vi.fn(),
  terminalCreate: vi.fn(() => Promise.resolve({ ok: true } as { ok: true } | { error: string })),
  terminalFocus: vi.fn(),
  terminalBlur: vi.fn(),
  sendBindingAction: vi.fn(() => Promise.resolve(true)),
  createdSurfaces: new Set<string>(),
  terminalStoreState: {
    findBarOpenByPaneId: {} as Record<string, boolean>,
    findBarFocusTokenByPaneId: {} as Record<string, number>,
    searchStateByPaneId: {} as Record<string, { total: number; selected: number } | undefined>,
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../hooks/useNativeView", () => ({
  useNativeView: (args: unknown) => terminalPaneMocks.useNativeView(args),
}));

vi.mock("../store/terminal-store", () => ({
  useTerminalStore: (
    selector: (
      state: typeof terminalPaneMocks.terminalStoreState & {
        closeFindBar: typeof terminalPaneMocks.closeFindBar;
      },
    ) => unknown,
  ) =>
    selector({
      ...terminalPaneMocks.terminalStoreState,
      closeFindBar: terminalPaneMocks.closeFindBar,
    }),
}));

vi.mock("../lib/terminal-surface-session", () => ({
  hasCreatedTerminalSurface: (surfaceId: string) =>
    terminalPaneMocks.createdSurfaces.has(surfaceId),
  markTerminalSurfaceCreated: (surfaceId: string) => {
    terminalPaneMocks.createdSurfaces.add(surfaceId);
  },
  markTerminalSurfaceDestroyed: (surfaceId: string) => {
    terminalPaneMocks.createdSurfaces.delete(surfaceId);
  },
}));

vi.mock("./terminal/TerminalFindBar", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <button data-testid="close-find-bar" onClick={onClose} type="button">
      close
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  terminalPaneMocks.useNativeView.mockReset();
  terminalPaneMocks.useNativeView.mockReturnValue({ isVisible: true });
  terminalPaneMocks.closeFindBar.mockReset();
  terminalPaneMocks.terminalCreate.mockReset();
  terminalPaneMocks.terminalCreate.mockResolvedValue({ ok: true } as
    | { ok: true }
    | { error: string });
  terminalPaneMocks.terminalFocus.mockReset();
  terminalPaneMocks.terminalBlur.mockReset();
  terminalPaneMocks.sendBindingAction.mockClear();
  terminalPaneMocks.createdSurfaces.clear();

  terminalPaneMocks.terminalStoreState = {
    findBarOpenByPaneId: {},
    findBarFocusTokenByPaneId: {},
    searchStateByPaneId: {},
  };

  installMockWindowApi({
    terminal: {
      create: terminalPaneMocks.terminalCreate,
      focus: terminalPaneMocks.terminalFocus,
      blur: terminalPaneMocks.terminalBlur,
      sendBindingAction: terminalPaneMocks.sendBindingAction,
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

async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

test("creates the terminal surface once and focuses visible focused panes", async () => {
  await act(async () => {
    root?.render(
      <TerminalPane paneId="pane-1" config={{ cwd: "/tmp/project" }} isFocused={true} />,
    );
  });

  expect(terminalPaneMocks.createdSurfaces.has("pane-1")).toBe(true);
  expect(terminalPaneMocks.terminalCreate).toHaveBeenCalledWith("pane-1", { cwd: "/tmp/project" });
  expect(terminalPaneMocks.terminalFocus).toHaveBeenCalledWith("pane-1");

  await act(async () => {
    root?.render(
      <TerminalPane paneId="pane-1" config={{ cwd: "/tmp/project" }} isFocused={true} />,
    );
  });

  expect(terminalPaneMocks.terminalCreate).toHaveBeenCalledTimes(1);
});

test("blurs when the find bar is open and refocuses on close", async () => {
  terminalPaneMocks.terminalStoreState = {
    ...terminalPaneMocks.terminalStoreState,
    findBarOpenByPaneId: { "pane-1": true },
    findBarFocusTokenByPaneId: { "pane-1": 1 },
    searchStateByPaneId: { "pane-1": { total: 3, selected: 1 } },
  };

  await act(async () => {
    root?.render(<TerminalPane paneId="pane-1" config={{}} isFocused={true} />);
  });

  expect(terminalPaneMocks.terminalBlur).toHaveBeenCalledTimes(1);
  expect(terminalPaneMocks.terminalFocus).not.toHaveBeenCalled();

  const button = container.querySelector('[data-testid="close-find-bar"]');
  expect(button).toBeTruthy();

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(terminalPaneMocks.closeFindBar).toHaveBeenCalledWith("pane-1");
  expect(terminalPaneMocks.sendBindingAction).toHaveBeenCalledWith("pane-1", "end_search");
  expect(terminalPaneMocks.terminalFocus).toHaveBeenCalledWith("pane-1");
});

test("renders a diagnostic when terminal creation fails", async () => {
  terminalPaneMocks.terminalCreate.mockResolvedValue({
    error: "Ghostty not initialized",
  } as { ok: true } | { error: string });

  await act(async () => {
    root?.render(<TerminalPane paneId="pane-1" config={{}} isFocused={true} />);
  });

  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(container.textContent).toContain("Terminal failed to start");
  expect(container.textContent).toContain("Ghostty not initialized");
  expect(terminalPaneMocks.createdSurfaces.has("pane-1")).toBe(false);
});

test("retries terminal creation after an initial failure", async () => {
  terminalPaneMocks.terminalCreate
    .mockResolvedValueOnce({ error: "Ghostty not initialized" } as { ok: true } | { error: string })
    .mockResolvedValueOnce({ ok: true } as { ok: true } | { error: string });

  await act(async () => {
    root?.render(
      <TerminalPane paneId="pane-1" config={{ cwd: "/tmp/project" }} isFocused={true} />,
    );
  });

  await flushAsyncEffects();
  await flushAsyncEffects();

  const retryButton = container.querySelector('button[type="button"]');
  expect(retryButton?.textContent).toBe("Retry");

  await act(async () => {
    retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(terminalPaneMocks.terminalCreate).toHaveBeenCalledTimes(2);
  expect(terminalPaneMocks.terminalCreate).toHaveBeenNthCalledWith(2, "pane-1", {
    cwd: "/tmp/project",
  });
  expect(container.textContent).not.toContain("Terminal failed to start");
  expect(terminalPaneMocks.createdSurfaces.has("pane-1")).toBe(true);
});

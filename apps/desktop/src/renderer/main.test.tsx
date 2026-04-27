// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";

const mainBootstrapMocks = vi.hoisted(() => ({
  initializeWorkspaceStore: vi.fn(async () => {}),
  resetWorkspaceStoreToDefaults: vi.fn(),
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: () => ({
      render: mainBootstrapMocks.render,
    }),
  },
}));

vi.mock("./store/workspace-store", () => ({
  initializeWorkspaceStore: mainBootstrapMocks.initializeWorkspaceStore,
  resetWorkspaceStoreToDefaults: mainBootstrapMocks.resetWorkspaceStoreToDefaults,
  useWorkspaceStore: { getState: vi.fn() },
}));

vi.mock("./store/native-view-store", () => ({
  getNativeViewProfilingSnapshot: vi.fn(),
  resetNativeViewProfilingCounters: vi.fn(),
}));

vi.mock("./App", () => ({
  default: () => <div>App</div>,
}));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  mainBootstrapMocks.initializeWorkspaceStore.mockReset();
  mainBootstrapMocks.initializeWorkspaceStore.mockResolvedValue(undefined);
  mainBootstrapMocks.resetWorkspaceStoreToDefaults.mockReset();
  mainBootstrapMocks.render.mockReset();
  vi.resetModules();
});

test("bootstrap falls back to defaults when workspace initialization fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.body.innerHTML = '<div id="root"></div>';
  mainBootstrapMocks.initializeWorkspaceStore.mockRejectedValueOnce(new Error("db failed"));

  await import("./main");
  await vi.dynamicImportSettled();

  expect(mainBootstrapMocks.resetWorkspaceStoreToDefaults).toHaveBeenCalledTimes(1);
  expect(mainBootstrapMocks.render).toHaveBeenCalledTimes(1);
});

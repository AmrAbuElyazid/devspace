// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import EditorPane, { markEditorDestroyed } from "./EditorPane";

const editorPaneMocks = vi.hoisted(() => ({
  useNativeView: vi.fn(),
  browserSetFocus: vi.fn(),
  editorStart: vi.fn(),
  updatePaneConfig: vi.fn(),
  updatePaneTitle: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../hooks/useNativeView", () => ({
  useNativeView: (args: unknown) => editorPaneMocks.useNativeView(args),
}));

vi.mock("../store/settings-store", () => ({
  useSettingsStore: (selector: (state: { vscodeCliPath: string | null }) => unknown) =>
    selector({ vscodeCliPath: null }),
}));

vi.mock("../store/workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: {
      updatePaneConfig: typeof editorPaneMocks.updatePaneConfig;
      updatePaneTitle: typeof editorPaneMocks.updatePaneTitle;
    }) => unknown,
  ) =>
    selector({
      updatePaneConfig: editorPaneMocks.updatePaneConfig,
      updatePaneTitle: editorPaneMocks.updatePaneTitle,
    }),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  editorPaneMocks.useNativeView.mockReset();
  editorPaneMocks.useNativeView.mockReturnValue({ isVisible: true });
  editorPaneMocks.browserSetFocus.mockReset();
  editorPaneMocks.editorStart.mockReset();
  editorPaneMocks.editorStart.mockResolvedValue({ url: "http://127.0.0.1:3000" });
  editorPaneMocks.updatePaneConfig.mockReset();
  editorPaneMocks.updatePaneTitle.mockReset();

  installMockWindowApi({
    browser: {
      setFocus: editorPaneMocks.browserSetFocus,
    },
    editor: {
      start: editorPaneMocks.editorStart,
      isAvailable: vi.fn(async () => true),
    },
  });
});

afterEach(async () => {
  markEditorDestroyed("pane-1");

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

test("focuses the native editor view when an already-visible pane becomes focused", async () => {
  await act(async () => {
    root?.render(
      <EditorPane paneId="pane-1" config={{ folderPath: "/tmp/project" }} isFocused={false} />,
    );
  });

  await flushAsyncEffects();
  await flushAsyncEffects();

  expect(editorPaneMocks.editorStart).toHaveBeenCalledWith("pane-1", "/tmp/project", null);
  expect(editorPaneMocks.browserSetFocus).not.toHaveBeenCalled();

  await act(async () => {
    root?.render(
      <EditorPane paneId="pane-1" config={{ folderPath: "/tmp/project" }} isFocused={true} />,
    );
  });

  expect(editorPaneMocks.browserSetFocus).toHaveBeenCalledTimes(1);
  expect(editorPaneMocks.browserSetFocus).toHaveBeenCalledWith("pane-1");
});

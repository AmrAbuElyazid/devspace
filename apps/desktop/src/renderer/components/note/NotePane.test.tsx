// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "../../test-utils/mock-window-api";
import type { NoteEditorChangeContext } from "@devspace/note-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notePaneMocks = vi.hoisted(() => ({
  onChange: undefined as ((ctx: NoteEditorChangeContext) => void) | undefined,
  initialValues: [] as Array<unknown>,
  updatePaneTitle: vi.fn(),
  extractNoteTitle: vi.fn((value: Array<{ children?: Array<{ text?: string }> }>) => {
    const text = value[0]?.children
      ?.map((child) => child.text ?? "")
      .join("")
      .trim();
    return text || "Untitled Note";
  }),
}));

vi.mock("@devspace/note-editor", () => ({
  NoteEditor: ({
    initialValue,
    onChange,
  }: {
    initialValue: unknown;
    onChange: (ctx: NoteEditorChangeContext) => void;
  }) => {
    notePaneMocks.initialValues.push(initialValue);
    notePaneMocks.onChange = onChange;
    return <div data-testid="note-editor" />;
  },
  extractNoteTitle: notePaneMocks.extractNoteTitle,
}));

vi.mock("../../store/workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: { updatePaneTitle: typeof notePaneMocks.updatePaneTitle }) => unknown,
  ) => selector({ updatePaneTitle: notePaneMocks.updatePaneTitle }),
}));

let container: HTMLDivElement;
let root: Root | null;

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  notePaneMocks.onChange = undefined;
  notePaneMocks.initialValues = [];
  notePaneMocks.updatePaneTitle.mockReset();
  notePaneMocks.extractNoteTitle.mockClear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  container.remove();
});

test("shows an error state when note loading fails", async () => {
  installMockWindowApi({
    notes: {
      read: vi.fn(async () => {
        throw new Error("permission denied");
      }),
    },
  });

  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} />);
  });
  await flushEffects();

  expect(container.textContent).toContain("Failed to load note");
});

test("surfaces serialization failures without saving corrupted content", async () => {
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: null,
      serializationError: "serialize failed",
      value: [{ type: "p", children: [{ text: "Broken title" }] }],
    });
  });

  await act(async () => {
    vi.advanceTimersByTime(600);
  });

  expect(notePaneMocks.updatePaneTitle).toHaveBeenCalledWith("pane-1", "Broken title");
  expect(api.notes.save).not.toHaveBeenCalled();
  expect(api.notes.saveSync).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Save failed: serialize failed");
});

test("flushes pending note edits synchronously before unload", async () => {
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# Saved",
      serializationError: null,
      value: [{ type: "p", children: [{ text: "Saved" }] }],
    });
  });

  await act(async () => {
    window.dispatchEvent(new Event("beforeunload"));
  });

  expect(api.notes.saveSync).toHaveBeenCalledWith("note-1", "# Saved");
  expect(api.notes.save).not.toHaveBeenCalled();
});

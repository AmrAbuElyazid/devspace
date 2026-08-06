// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "../../test-utils/mock-window-api";
import type { NoteEditorChangeContext } from "@devspace/note-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notePaneMocks = vi.hoisted(() => ({
  onChange: undefined as ((ctx: NoteEditorChangeContext) => void) | undefined,
  controller: {
    focus: vi.fn(),
    markdown: vi.fn(() => "# On disk"),
    matches: vi.fn(() => []),
    replaceAll: vi.fn(() => 0),
    replaceMatch: vi.fn(),
    revealMatch: vi.fn(),
    scrollToBlock: vi.fn(),
    toggleFold: vi.fn(),
    value: vi.fn(() => [{ children: [{ text: "On disk" }], type: "h1" }]),
  },
  noteOutline: vi.fn(() => []),
  noteStats: vi.fn(() => ({ characters: 0, readingMinutes: 0, words: 0 })),
  autoFocusValues: [] as boolean[],
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

// The editor itself is covered by its own package's suite; what matters here
// is how the pane reacts to what the editor reports, so it is stubbed down to
// the `onChange` contract.
vi.mock("@devspace/note-editor", () => ({
  NoteEditor: ({
    autoFocus,
    controllerRef,
    initialValue,
    onChange,
  }: {
    autoFocus?: boolean;
    controllerRef?: { current: unknown };
    initialValue: unknown;
    onChange: (ctx: NoteEditorChangeContext) => void;
  }) => {
    notePaneMocks.autoFocusValues.push(autoFocus === true);
    notePaneMocks.initialValues.push(initialValue);
    notePaneMocks.onChange = onChange;
    if (controllerRef) controllerRef.current = notePaneMocks.controller;
    return <div data-testid="note-editor" />;
  },
  extractNoteTitle: notePaneMocks.extractNoteTitle,
  noteOutline: notePaneMocks.noteOutline,
  noteStats: notePaneMocks.noteStats,
}));

vi.mock("@devspace/note-editor/styles.css", () => ({}));

vi.mock("../../store/workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: { updatePaneTitle: typeof notePaneMocks.updatePaneTitle }) => unknown,
  ) => selector({ updatePaneTitle: notePaneMocks.updatePaneTitle }),
}));

let container: HTMLDivElement;
let root: Root | null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  notePaneMocks.onChange = undefined;
  notePaneMocks.autoFocusValues = [];
  notePaneMocks.initialValues = [];
  notePaneMocks.updatePaneTitle.mockReset();
  notePaneMocks.extractNoteTitle.mockClear();
  notePaneMocks.controller.markdown.mockReturnValue("# On disk");
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
  consoleErrorSpy.mockRestore();
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
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  expect(container.textContent).toContain("Failed to load note");
});

test("reconciles the pane title from loaded markdown content", async () => {
  installMockWindowApi({
    notes: {
      read: vi.fn(async () => "# Loaded title\n\nBody copy"),
    },
  });

  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  expect(notePaneMocks.initialValues.at(-1)).toBe("# Loaded title\n\nBody copy");
  expect(notePaneMocks.updatePaneTitle).toHaveBeenCalledWith("pane-1", "Loaded title");
});

test("surfaces serialization failures without saving corrupted content", async () => {
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
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
  expect(container.textContent).toContain("Save failed");
});

test("a serialization failure does not stop later edits from saving", async () => {
  // The regression this guards: the pane used to null out its cached markdown
  // on a failed serialize and never restore it, so one bad keystroke silently
  // disabled saving for the rest of the pane's life.
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: null,
      serializationError: "serialize failed",
      value: [{ type: "p", children: [{ text: "Broken" }] }],
    });
  });

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# Recovered",
      serializationError: null,
      value: [{ type: "p", children: [{ text: "Recovered" }] }],
    });
  });

  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  await flushEffects();

  expect(api.notes.save).toHaveBeenCalledWith("note-1", "# Recovered");
  expect(container.textContent).not.toContain("Save failed");
});

test("keeps the last good markdown when a later change fails to serialize", async () => {
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# Good",
      serializationError: null,
      value: [{ type: "p", children: [{ text: "Good" }] }],
    });
  });

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: null,
      serializationError: "serialize failed",
      value: [{ type: "p", children: [{ text: "Bad" }] }],
    });
  });

  await act(async () => {
    window.dispatchEvent(new Event("beforeunload"));
  });

  // Better to persist the last version we could represent than to drop the
  // whole note because one edit could not be serialized.
  expect(api.notes.saveSync).toHaveBeenCalledWith("note-1", "# Good");
});

test("flushes pending note edits synchronously before unload", async () => {
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
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

test("surfaces synchronous flush failures when the app is hidden", async () => {
  const api = installMockWindowApi({
    notes: {
      saveSync: vi.fn(() => ({ error: "disk full" })),
    },
  });
  const { default: NotePane } = await import("./NotePane");

  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# Unsaved",
      serializationError: null,
      value: [{ type: "p", children: [{ text: "Unsaved" }] }],
    });
  });

  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  expect(api.notes.saveSync).toHaveBeenCalledWith("note-1", "# Unsaved");
  expect(container.textContent).toContain("Save failed");

  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
  } else {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  }
});

test("passes focus state through to the note editor", async () => {
  installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={false} />);
  });
  await flushEffects();

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });

  expect(notePaneMocks.autoFocusValues).toContain(false);
  expect(notePaneMocks.autoFocusValues).toContain(true);
});

test("opening a note does not rewrite the file", async () => {
  // Loading normalizes the document — a trailing paragraph, canonical table
  // pipes — which produces a change. Saving that change rewrote a file the user
  // never touched, which matters for notes tracked in git or edited elsewhere.
  const api = installMockWindowApi({
    notes: { read: vi.fn(async () => "# On disk") },
  });
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# On disk",
      serializationError: null,
      value: [{ type: "h1", children: [{ text: "On disk" }] }],
    });
  });
  await act(async () => {
    vi.advanceTimersByTime(600);
  });

  expect(api.notes.save).not.toHaveBeenCalled();
});

test("a real edit after opening still saves", async () => {
  const api = installMockWindowApi({
    notes: { read: vi.fn(async () => "# On disk") },
  });
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# On disk edited",
      serializationError: null,
      value: [{ type: "h1", children: [{ text: "On disk edited" }] }],
    });
  });
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  await flushEffects();

  expect(api.notes.save).toHaveBeenCalledWith("note-1", "# On disk edited");
});

test("counts and outline are populated before the first keystroke", async () => {
  installMockWindowApi({ notes: { read: vi.fn(async () => "# On disk") } });
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  // Plate emits no change on mount, so the pane has to ask the editor for the
  // value rather than waiting for one.
  expect(notePaneMocks.controller.value).toHaveBeenCalled();
  expect(notePaneMocks.noteStats).toHaveBeenCalledWith([
    { children: [{ text: "On disk" }], type: "h1" },
  ]);
  expect(notePaneMocks.noteOutline).toHaveBeenCalled();
});

test("a failed serialization leaves the pending write of the last good markdown armed", async () => {
  // Clearing the timer and then bailing out dropped an already-serializable
  // version that was 500ms from disk.
  const api = installMockWindowApi();
  const { default: NotePane } = await import("./NotePane");

  await act(async () => {
    root?.render(<NotePane paneId="pane-1" config={{ noteId: "note-1" }} isFocused={true} />);
  });
  await flushEffects();

  await act(async () => {
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: "# Good",
      serializationError: null,
      value: [{ type: "p", children: [{ text: "Good" }] }],
    });
  });

  // Fails well inside the debounce window.
  await act(async () => {
    vi.advanceTimersByTime(100);
    notePaneMocks.onChange?.({
      editor: {} as NoteEditorChangeContext["editor"],
      markdown: null,
      serializationError: "serialize failed",
      value: [{ type: "p", children: [{ text: "Bad" }] }],
    });
  });

  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  await flushEffects();

  expect(api.notes.save).toHaveBeenCalledWith("note-1", "# Good");
});

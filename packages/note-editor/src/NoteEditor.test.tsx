// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noteEditorMocks = vi.hoisted(() => {
  const plateProps: {
    editor: unknown;
    onChange: ((ctx: { value: unknown; editor: unknown }) => void) | undefined;
  } = {
    editor: undefined,
    onChange: undefined,
  };

  return {
    plateProps,
    editorProps: {
      onMouseDown: undefined as
        | ((event: { target: EventTarget | null; currentTarget: EventTarget | null }) => void)
        | undefined,
    },
    usePlateEditor: vi.fn(),
    createNoteEditorPlugins: vi.fn(() => ["plugin-a", "plugin-b"]),
    tooltipProviderCalls: 0,
  };
});

vi.mock("./plugins/note-editor-kit", () => ({
  createNoteEditorPlugins: noteEditorMocks.createNoteEditorPlugins,
}));

vi.mock("./plate-ui/editor", () => ({
  EditorContainer: ({ children }: { children: unknown }) => children,
  Editor: ({ onMouseDown }: { onMouseDown?: (event: unknown) => void }) => {
    noteEditorMocks.editorProps.onMouseDown =
      onMouseDown as typeof noteEditorMocks.editorProps.onMouseDown;
    return <div />;
  },
}));

vi.mock("./plate-ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => {
    noteEditorMocks.tooltipProviderCalls += 1;
    return children;
  },
}));

vi.mock("platejs/react", () => ({
  Plate: ({
    editor,
    onChange,
    children,
  }: {
    editor: unknown;
    onChange: (ctx: { value: unknown; editor: unknown }) => void;
    children: unknown;
  }) => {
    noteEditorMocks.plateProps.editor = editor;
    noteEditorMocks.plateProps.onChange = onChange;
    return children;
  },
  usePlateEditor: noteEditorMocks.usePlateEditor,
}));

vi.mock("@platejs/markdown", () => ({
  MarkdownPlugin: { key: "markdown" },
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  noteEditorMocks.usePlateEditor.mockReset();
  noteEditorMocks.createNoteEditorPlugins.mockClear();
  noteEditorMocks.tooltipProviderCalls = 0;
  noteEditorMocks.plateProps.editor = undefined;
  noteEditorMocks.plateProps.onChange = undefined;
  noteEditorMocks.editorProps.onMouseDown = undefined;
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

test("deserializes markdown initial values through the markdown plugin", async () => {
  const mockEditor = {
    getApi: vi.fn(() => ({
      markdown: {
        deserialize: vi.fn((markdown: string) => [{ type: "p", children: [{ text: markdown }] }]),
      },
    })),
  };
  noteEditorMocks.usePlateEditor.mockImplementation((options: { value: unknown }) => {
    const valueFactory = options.value as (editor: typeof mockEditor) => unknown;
    expect(valueFactory(mockEditor)).toEqual([{ type: "p", children: [{ text: "# Hello" }] }]);
    return mockEditor;
  });

  await act(async () => {
    root?.render(<NoteEditor initialValue="# Hello" onChange={vi.fn()} />);
  });

  expect(noteEditorMocks.createNoteEditorPlugins).toHaveBeenCalledTimes(1);
  expect(noteEditorMocks.usePlateEditor).toHaveBeenCalledWith(
    expect.objectContaining({ plugins: ["plugin-a", "plugin-b"] }),
  );
  expect(noteEditorMocks.tooltipProviderCalls).toBe(1);
});

test("forwards serialized markdown on editor changes", async () => {
  const serialize = vi.fn(() => "# Saved");
  const onChange = vi.fn();
  const mockEditor = {
    getApi: vi.fn(() => ({ markdown: { serialize } })),
  };
  noteEditorMocks.usePlateEditor.mockReturnValue(mockEditor);

  await act(async () => {
    root?.render(<NoteEditor initialValue={[]} onChange={onChange} />);
  });

  const value = [{ type: "p", children: [{ text: "Saved" }] }];
  await act(async () => {
    noteEditorMocks.plateProps.onChange?.({ value, editor: mockEditor });
  });

  expect(onChange).toHaveBeenCalledWith({
    editor: mockEditor,
    markdown: "# Saved",
    serializationError: null,
    value,
  });
});

test("surfaces serialization failures without corrupting persisted markdown", async () => {
  const onChange = vi.fn();
  const throwingEditor = {
    getApi: vi.fn(() => ({
      markdown: {
        serialize: () => {
          throw new Error("serialize failed");
        },
      },
    })),
  };
  noteEditorMocks.usePlateEditor.mockReturnValue(throwingEditor);

  await act(async () => {
    root?.render(<NoteEditor initialValue={[]} onChange={onChange} />);
  });

  const missingEditorValue = [{ type: "p", children: [{ text: "No editor" }] }];
  await act(async () => {
    noteEditorMocks.plateProps.onChange?.({ value: missingEditorValue, editor: null });
  });

  expect(onChange).toHaveBeenNthCalledWith(1, {
    editor: null,
    markdown: null,
    serializationError: "Editor unavailable",
    value: missingEditorValue,
  });

  const throwingValue = [{ type: "p", children: [{ text: "Throw" }] }];
  await act(async () => {
    noteEditorMocks.plateProps.onChange?.({ value: throwingValue, editor: throwingEditor });
  });

  expect(onChange).toHaveBeenNthCalledWith(2, {
    editor: throwingEditor,
    markdown: null,
    serializationError: "serialize failed",
    value: throwingValue,
  });
});

test("preserves the existing selection when clicking the blank editor surface", async () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const focus = vi.fn();
  const mockEditor = {
    api: {
      end: vi.fn(() => ({ path: [0, 0], offset: 0 })),
    },
    selection: { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 1 } },
    tf: {
      focus,
      select,
    },
    getApi: vi.fn(() => ({
      markdown: {
        serialize: vi.fn(() => ""),
      },
    })),
  };
  noteEditorMocks.usePlateEditor.mockReturnValue(mockEditor);

  await act(async () => {
    root?.render(<NoteEditor initialValue={[]} onChange={vi.fn()} />);
  });

  const target = document.createElement("div");

  await act(async () => {
    noteEditorMocks.editorProps.onMouseDown?.({
      currentTarget: target,
      target,
    });
    vi.runAllTimers();
  });

  expect(mockEditor.api.end).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});

test("falls back to the document end when no selection exists", async () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const focus = vi.fn();
  const mockEditor = {
    api: {
      end: vi.fn(() => ({ path: [0, 0], offset: 0 })),
    },
    selection: null,
    tf: {
      focus,
      select,
    },
    getApi: vi.fn(() => ({
      markdown: {
        serialize: vi.fn(() => ""),
      },
    })),
  };
  noteEditorMocks.usePlateEditor.mockReturnValue(mockEditor);

  await act(async () => {
    root?.render(<NoteEditor initialValue={[]} onChange={vi.fn()} />);
  });

  const target = document.createElement("div");

  await act(async () => {
    noteEditorMocks.editorProps.onMouseDown?.({
      currentTarget: target,
      target,
    });
    vi.runAllTimers();
  });

  expect(mockEditor.api.end).toHaveBeenCalledWith([]);
  expect(select).toHaveBeenCalledWith({ path: [0, 0], offset: 0 });
  expect(focus).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});

test("auto-focuses when the editor becomes focused", async () => {
  const select = vi.fn();
  const focus = vi.fn();
  const mockEditor = {
    api: {
      end: vi.fn(() => ({ path: [0, 0], offset: 0 })),
    },
    selection: null,
    tf: {
      focus,
      select,
    },
    getApi: vi.fn(() => ({
      markdown: {
        serialize: vi.fn(() => ""),
      },
    })),
  };
  noteEditorMocks.usePlateEditor.mockReturnValue(mockEditor);

  await act(async () => {
    root?.render(<NoteEditor autoFocus={false} initialValue={[]} onChange={vi.fn()} />);
  });

  expect(focus).not.toHaveBeenCalled();

  await act(async () => {
    root?.render(<NoteEditor autoFocus={true} initialValue={[]} onChange={vi.fn()} />);
  });

  expect(mockEditor.api.end).toHaveBeenCalledWith([]);
  expect(select).toHaveBeenCalledWith({ path: [0, 0], offset: 0 });
  expect(focus).toHaveBeenCalledTimes(1);
});

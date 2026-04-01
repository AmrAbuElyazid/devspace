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
    usePlateEditor: vi.fn(),
    createNoteEditorPlugins: vi.fn(() => ["plugin-a", "plugin-b"]),
  };
});

vi.mock("./plugins/note-editor-kit", () => ({
  createNoteEditorPlugins: noteEditorMocks.createNoteEditorPlugins,
}));

vi.mock("./plate-ui/editor", () => ({
  EditorContainer: ({ children }: { children: unknown }) => children,
  Editor: () => null,
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
  noteEditorMocks.usePlateEditor.mockReset();
  noteEditorMocks.createNoteEditorPlugins.mockClear();
  noteEditorMocks.plateProps.editor = undefined;
  noteEditorMocks.plateProps.onChange = undefined;
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
    value,
  });
});

test("falls back to JSON when the editor is missing or serialization throws", async () => {
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
    markdown: JSON.stringify(missingEditorValue),
    value: missingEditorValue,
  });

  const throwingValue = [{ type: "p", children: [{ text: "Throw" }] }];
  await act(async () => {
    noteEditorMocks.plateProps.onChange?.({ value: throwingValue, editor: throwingEditor });
  });

  expect(onChange).toHaveBeenNthCalledWith(2, {
    editor: throwingEditor,
    markdown: JSON.stringify(throwingValue),
    value: throwingValue,
  });
});

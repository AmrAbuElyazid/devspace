import { describe, expect, test, vi } from "vitest";

const noteEditorKitMocks = vi.hoisted(() => ({
  createSlatePlugin: vi.fn(
    (config: { key: string; extendEditor: (args: { editor: unknown }) => unknown }) => config,
  ),
  kits: {
    autoformat: ["autoformat"],
    basicNodes: ["basic-nodes-a", "basic-nodes-b"],
    blockPlaceholder: ["block-placeholder"],
    blockSelection: ["block-selection"],
    callout: ["callout"],
    codeBlock: ["code-block"],
    dnd: ["dnd"],
    findReplace: ["find-replace"],
    floatingToolbar: ["floating-toolbar"],
    headingFold: ["heading-fold"],
    indent: ["indent"],
    link: ["link"],
    list: ["list"],
    markdown: ["markdown"],
    math: ["math"],
    media: ["media"],
    slash: ["slash"],
    table: ["table"],
  },
}));

vi.mock("platejs", () => ({
  createSlatePlugin: noteEditorKitMocks.createSlatePlugin,
  KEYS: { p: "p" },
}));

vi.mock("./markdown-kit", () => ({
  MarkdownKit: noteEditorKitMocks.kits.markdown,
}));

vi.mock("./math-kit", () => ({
  MathKit: noteEditorKitMocks.kits.math,
}));

vi.mock("./media-kit", () => ({
  MediaKit: noteEditorKitMocks.kits.media,
}));

vi.mock("./find-replace-kit", () => ({
  FindReplaceKit: noteEditorKitMocks.kits.findReplace,
}));

vi.mock("./heading-fold-kit", () => ({
  HeadingFoldKit: noteEditorKitMocks.kits.headingFold,
}));

vi.mock("./autoformat-kit", () => ({
  AutoformatKit: noteEditorKitMocks.kits.autoformat,
}));

vi.mock("./basic-nodes-kit", () => ({
  BasicNodesKit: noteEditorKitMocks.kits.basicNodes,
}));

vi.mock("./block-placeholder-kit", () => ({
  BlockPlaceholderKit: noteEditorKitMocks.kits.blockPlaceholder,
}));

vi.mock("./block-selection-kit", () => ({
  BlockSelectionKit: noteEditorKitMocks.kits.blockSelection,
}));

vi.mock("./callout-kit", () => ({
  CalloutKit: noteEditorKitMocks.kits.callout,
}));

vi.mock("./code-block-kit", () => ({
  CodeBlockKit: noteEditorKitMocks.kits.codeBlock,
}));

vi.mock("./floating-toolbar-kit", () => ({
  FloatingToolbarKit: noteEditorKitMocks.kits.floatingToolbar,
}));

vi.mock("./indent-kit", () => ({
  IndentKit: noteEditorKitMocks.kits.indent,
}));

vi.mock("./link-kit", () => ({
  LinkKit: noteEditorKitMocks.kits.link,
}));

vi.mock("./list-kit", () => ({
  ListKit: noteEditorKitMocks.kits.list,
}));

vi.mock("./slash-kit", () => ({
  SlashKit: noteEditorKitMocks.kits.slash,
}));

vi.mock("./table-kit", () => ({
  TableKit: noteEditorKitMocks.kits.table,
}));

vi.mock("./dnd-kit", () => ({
  DndKit: noteEditorKitMocks.kits.dnd,
}));

const { createNoteEditorPlugins } = await import("./note-editor-kit");

describe("createNoteEditorPlugins", () => {
  test("assembles the expected plugin kits in order", () => {
    const plugins = createNoteEditorPlugins();

    expect(plugins).toEqual([
      ...noteEditorKitMocks.kits.basicNodes,
      ...noteEditorKitMocks.kits.list,
      ...noteEditorKitMocks.kits.link,
      ...noteEditorKitMocks.kits.codeBlock,
      ...noteEditorKitMocks.kits.callout,
      ...noteEditorKitMocks.kits.table,
      ...noteEditorKitMocks.kits.math,
      ...noteEditorKitMocks.kits.media,
      ...noteEditorKitMocks.kits.indent,
      ...noteEditorKitMocks.kits.autoformat,
      ...noteEditorKitMocks.kits.slash,
      ...noteEditorKitMocks.kits.floatingToolbar,
      ...noteEditorKitMocks.kits.blockSelection,
      ...noteEditorKitMocks.kits.blockPlaceholder,
      ...noteEditorKitMocks.kits.headingFold,
      ...noteEditorKitMocks.kits.dnd,
      ...noteEditorKitMocks.kits.findReplace,
      ...noteEditorKitMocks.kits.markdown,
      expect.objectContaining({ key: "ensure-paragraph" }),
    ]);
    expect(noteEditorKitMocks.createSlatePlugin).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ensure-paragraph" }),
    );
  });

  test("ensure-paragraph inserts a paragraph when the root becomes empty", () => {
    const plugins = createNoteEditorPlugins();
    const ensureParagraphPlugin = plugins.at(-1) as unknown as {
      extendEditor: (args: { editor: typeof editor }) => typeof editor;
    };
    const insertNodes = vi.fn();
    const originalNormalizeNode = vi.fn();
    const editor = {
      normalizeNode: originalNormalizeNode,
      tf: { insertNodes },
    };

    ensureParagraphPlugin.extendEditor({ editor }).normalizeNode([{ children: [] }, []]);

    expect(insertNodes).toHaveBeenCalledWith({ type: "p", children: [{ text: "" }] }, { at: [0] });
    expect(originalNormalizeNode).not.toHaveBeenCalled();
  });

  test("ensure-paragraph falls back to the original normalizer for non-empty roots", () => {
    const plugins = createNoteEditorPlugins();
    const ensureParagraphPlugin = plugins.at(-1) as unknown as {
      extendEditor: (args: { editor: typeof editor }) => typeof editor;
    };
    const insertNodes = vi.fn();
    const originalNormalizeNode = vi.fn();
    const editor = {
      normalizeNode: originalNormalizeNode,
      tf: { insertNodes },
    };
    const entry = [{ children: [{ text: "Existing" }] }, []] as const;

    ensureParagraphPlugin.extendEditor({ editor }).normalizeNode(entry, { operation: "normalize" });

    expect(insertNodes).not.toHaveBeenCalled();
    expect(originalNormalizeNode).toHaveBeenCalledWith(entry, { operation: "normalize" });
  });
});

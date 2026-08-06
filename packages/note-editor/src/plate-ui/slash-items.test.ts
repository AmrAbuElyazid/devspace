// @vitest-environment jsdom

/**
 * What each `/` command actually does to the document.
 *
 * Driven against a real editor rather than a mocked one: the previous version
 * asserted that `toggleBlock` had been *called* with `"h1"`, which stays green
 * even when no h1 plugin is registered to receive it.
 */

import { createSlateEditor, type Value } from "platejs";
import { beforeEach, describe, expect, test } from "vitest";

import { createNoteEditorPlugins } from "../plugins/note-editor-kit";
import { slashItems } from "./slash-items";

function freshEditor() {
  const editor = createSlateEditor({
    plugins: createNoteEditorPlugins() as never,
    value: [{ children: [{ text: "" }], type: "p" }] as Value,
  });
  editor.tf.select({ offset: 0, path: [0, 0] });
  return editor;
}

const run = (label: string) => {
  const item = slashItems.find((candidate) => candidate.label === label);
  if (!item) throw new Error(`No slash item labelled "${label}"`);
  const editor = freshEditor();
  item.onSelect(editor as never);
  return editor;
};

const firstBlock = (editor: ReturnType<typeof freshEditor>) =>
  editor.children[0] as Record<string, unknown>;

describe("slash commands change the document", () => {
  test.each([
    ["Heading 1", "h1"],
    ["Heading 2", "h2"],
    ["Heading 3", "h3"],
    ["Quote", "blockquote"],
  ])("%s produces a %s block", (label, type) => {
    expect(firstBlock(run(label)).type).toBe(type);
  });

  test.each([
    ["Bulleted list", "disc"],
    ["Numbered list", "decimal"],
    ["To-do list", "todo"],
  ])("%s applies the %s list style", (label, listStyleType) => {
    expect(firstBlock(run(label)).listStyleType).toBe(listStyleType);
  });

  test("Code block produces a code block containing a code line", () => {
    const editor = run("Code block");
    const block = editor.children.find(
      (node) => (node as Record<string, unknown>).type === "code_block",
    ) as Record<string, unknown> | undefined;

    const lines = (block?.children ?? []) as Record<string, unknown>[];
    expect(lines[0]?.type).toBe("code_line");
  });

  test("Callout produces a callout", () => {
    const editor = run("Callout");
    expect(
      editor.children.some((node) => (node as Record<string, unknown>).type === "callout"),
    ).toBe(true);
  });

  test("Table produces a 3x3 table", () => {
    const editor = run("Table");
    const table = editor.children.find(
      (node) => (node as Record<string, unknown>).type === "table",
    ) as Record<string, unknown> | undefined;
    const rows = (table?.children ?? []) as Record<string, unknown>[];

    expect(rows).toHaveLength(3);
    expect(rows[0]?.children).toHaveLength(3);
  });

  test("Divider produces a rule followed by a paragraph to keep typing in", () => {
    const editor = run("Divider");
    expect(firstBlock(editor).type).toBe("hr");
    expect((editor.children[1] as Record<string, unknown>)?.type).toBe("p");
  });

  test("Text leaves a plain paragraph", () => {
    expect(firstBlock(run("Text")).type).toBe("p");
  });
});

describe("everything the menu offers is reachable", () => {
  let editor: ReturnType<typeof freshEditor>;

  beforeEach(() => {
    editor = freshEditor();
  });

  test("no command throws on an empty document", () => {
    for (const item of slashItems) {
      expect(() => item.onSelect(editor as never), item.label).not.toThrow();
    }
  });
});

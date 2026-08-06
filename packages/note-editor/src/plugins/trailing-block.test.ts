// @vitest-environment jsdom

/**
 * There must always be somewhere to type.
 *
 * A note ending in a code block, table or callout had no paragraph after it, so
 * clicking below the content put the caret inside that block and there was no
 * way to start a new one — the note was effectively closed off at the bottom.
 */

import { createSlateEditor, type Value } from "platejs";
import { describe, expect, test } from "vitest";

import { createNoteEditorPlugins } from "./note-editor-kit";

function normalized(value: Value): Value {
  // `shouldNormalizeEditor` mirrors how NoteEditor builds its editor: the
  // trailing block has to exist the moment a note is opened, not only after the
  // first edit.
  return createSlateEditor({
    plugins: createNoteEditorPlugins() as never,
    shouldNormalizeEditor: true,
    value,
  }).children as Value;
}

const lastType = (value: Value) => (value.at(-1) as { type?: string } | undefined)?.type;

describe("trailing block", () => {
  test.each([
    [
      "code block",
      [
        {
          children: [{ children: [{ text: "const a = 1;" }], type: "code_line" }],
          lang: "ts",
          type: "code_block",
        },
      ],
    ],
    [
      "table",
      [
        {
          children: [{ children: [{ children: [{ text: "a" }], type: "td" }], type: "tr" }],
          type: "table",
        },
      ],
    ],
    ["callout", [{ children: [{ children: [{ text: "hi" }], type: "p" }], type: "callout" }]],
    ["horizontal rule", [{ children: [{ text: "" }], type: "hr" }]],
    ["image", [{ children: [{ text: "" }], type: "img", url: "x.png" }]],
  ])("a note ending in a %s gains a paragraph to type in", (_name, value) => {
    expect(lastType(normalized(value as Value))).toBe("p");
  });

  test("an empty document still gets its paragraph", () => {
    expect(normalized([] as Value)).toEqual([{ children: [{ text: "" }], type: "p" }]);
  });

  test("a note already ending in a paragraph is left alone", () => {
    const value = [
      { children: [{ text: "Title" }], type: "h1" },
      { children: [{ text: "body" }], type: "p" },
    ] as Value;

    expect(normalized(value)).toHaveLength(2);
  });

  test("a note ending in a heading gains a paragraph", () => {
    // Otherwise the last heading in a note can never be typed under.
    expect(normalized([{ children: [{ text: "Title" }], type: "h1" }] as Value)).toHaveLength(2);
  });
});

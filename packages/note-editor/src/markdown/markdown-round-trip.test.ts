// @vitest-environment jsdom

/**
 * Storage contract for the note editor.
 *
 * Every note is persisted by serializing the editor value to markdown on each
 * debounced change, so a node the serializer cannot represent is not a cosmetic
 * gap — it throws, and `NotePane` then has nothing to write. This suite walks
 * every node and mark the toolbar and slash menu can insert and asserts three
 * things: it serializes, the markdown is what we intend to keep on disk, and it
 * comes back unchanged.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor, type Value } from "platejs";
import { describe, expect, test } from "vitest";

import { createNoteEditorPlugins } from "../plugins/note-editor-kit";
import { serializeNoteMarkdown } from "./serialize";

function editorWith(value: Value = [{ children: [{ text: "" }], type: "p" }]) {
  return createSlateEditor({ plugins: createNoteEditorPlugins() as never, value });
}

/** The exact path NotePane writes with, so these assertions describe the file. */
const serialize = (value: Value): string => serializeNoteMarkdown(editorWith(value));
const deserialize = (markdown: string): Value =>
  editorWith().getApi(MarkdownPlugin).markdown.deserialize(markdown) as Value;

/** Node ids are minted per instance and are not part of the storage contract. */
function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "id")
        .map(([key, entry]) => [key, stripIds(entry)]),
    );
  }
  return value;
}

const p = (...children: object[]): object => ({ children, type: "p" });
const text = (value: string, marks: object = {}): object => ({ text: value, ...marks });

const CASES: { name: string; value: Value }[] = [
  { name: "paragraph", value: [p(text("Plain text"))] as Value },
  {
    name: "headings",
    value: [
      { children: [text("H1")], type: "h1" },
      { children: [text("H2")], type: "h2" },
      { children: [text("H3")], type: "h3" },
      { children: [text("H4")], type: "h4" },
      { children: [text("H5")], type: "h5" },
      { children: [text("H6")], type: "h6" },
    ] as Value,
  },
  {
    name: "marks",
    value: [
      p(text("bold", { bold: true })),
      p(text("italic", { italic: true })),
      p(text("underline", { underline: true })),
      p(text("struck", { strikethrough: true })),
      p(text("code", { code: true })),
      p(text("highlight", { highlight: true })),
      p(text("kbd", { kbd: true })),
    ] as Value,
  },
  {
    name: "bulleted list",
    value: [
      { children: [text("one")], indent: 1, listStyleType: "disc", type: "p" },
      { children: [text("nested")], indent: 2, listStyleType: "disc", type: "p" },
    ] as Value,
  },
  {
    name: "numbered list",
    value: [
      { children: [text("first")], indent: 1, listStart: 1, listStyleType: "decimal", type: "p" },
      { children: [text("second")], indent: 1, listStart: 2, listStyleType: "decimal", type: "p" },
    ] as Value,
  },
  {
    name: "todo list",
    value: [
      { checked: true, children: [text("done")], indent: 1, listStyleType: "todo", type: "p" },
      { checked: false, children: [text("open")], indent: 1, listStyleType: "todo", type: "p" },
    ] as Value,
  },
  { name: "blockquote", value: [{ children: [text("quoted")], type: "blockquote" }] as Value },
  {
    name: "code block",
    value: [
      {
        children: [{ children: [text("const a = 1;")], type: "code_line" }],
        lang: "ts",
        type: "code_block",
      },
    ] as Value,
  },
  {
    name: "table",
    value: [
      {
        children: [
          {
            children: [
              { children: [p(text("Task"))], type: "th" },
              { children: [p(text("Owner"))], type: "th" },
            ],
            type: "tr",
          },
          {
            children: [
              { children: [p(text("Ship"))], type: "td" },
              { children: [p(text("amr"))], type: "td" },
            ],
            type: "tr",
          },
        ],
        type: "table",
      },
    ] as Value,
  },
  {
    name: "link",
    value: [
      p(text("see "), {
        children: [text("docs")],
        type: "a",
        url: "https://example.com",
      }),
    ] as Value,
  },
  { name: "horizontal rule", value: [{ children: [text("")], type: "hr" }] as Value },
  {
    name: "image",
    // `caption` is added by the image plugin's normalizer, so a real image node
    // always carries one even when the markdown has nothing to put in it.
    value: [
      {
        caption: [text("")],
        children: [text("")],
        type: "img",
        url: "devspace-note-asset://abc123.png",
      },
    ] as Value,
  },
  {
    name: "block equation",
    value: [{ children: [text("")], texExpression: "x^2 + y^2 = z^2", type: "equation" }] as Value,
  },
];

describe("markdown round trip", () => {
  test.each(CASES)("$name survives serialize -> deserialize", ({ value }) => {
    const markdown = serialize(value);
    expect(stripIds(deserialize(markdown))).toEqual(stripIds(value));
  });

  test.each(CASES)("$name serializes to stable markdown", ({ value }) => {
    expect(serialize(value)).toBe(serialize(value));
  });
});

describe("callouts map to GFM alerts", () => {
  const callout = (variant: string, icon: string): Value =>
    [
      {
        children: [p(text("Body text"))],
        icon,
        type: "callout",
        variant,
      },
    ] as Value;

  test("serializes to an alert blockquote", () => {
    expect(serialize(callout("warning", "⚠️"))).toMatchInlineSnapshot(`
      "> [!WARNING]
      > Body text
      "
    `);
  });

  test.each([
    ["note", "\u{1F4DD}"],
    ["tip", "\u{1F4A1}"],
    ["info", "ℹ️"],
    ["warning", "⚠️"],
    ["error", "\u{1F6D1}"],
  ])("%s round trips", (variant, icon) => {
    const value = callout(variant, icon);
    expect(stripIds(deserialize(serialize(value)))).toEqual(stripIds(value));
  });

  test("does not mint a new id on every serialization", () => {
    const value = callout("note", "\u{1F4DD}");
    expect(serialize(value)).toBe(serialize(value));
  });

  test("leaves an ordinary blockquote alone", () => {
    expect(deserialize("> just a quote")).toEqual([
      { children: [{ text: "just a quote" }], type: "blockquote" },
    ]);
  });
});

describe("reading markdown written elsewhere", () => {
  test("GFM table", () => {
    expect(deserialize("| a | b |\n| - | - |\n| 1 | 2 |")).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "children": [
                {
                  "children": [
                    {
                      "children": [
                        {
                          "text": "a",
                        },
                      ],
                      "type": "p",
                    },
                  ],
                  "type": "th",
                },
                {
                  "children": [
                    {
                      "children": [
                        {
                          "text": "b",
                        },
                      ],
                      "type": "p",
                    },
                  ],
                  "type": "th",
                },
              ],
              "type": "tr",
            },
            {
              "children": [
                {
                  "children": [
                    {
                      "children": [
                        {
                          "text": "1",
                        },
                      ],
                      "type": "p",
                    },
                  ],
                  "type": "td",
                },
                {
                  "children": [
                    {
                      "children": [
                        {
                          "text": "2",
                        },
                      ],
                      "type": "p",
                    },
                  ],
                  "type": "td",
                },
              ],
              "type": "tr",
            },
          ],
          "type": "table",
        },
      ]
    `);
  });

  test("task list keeps its checked state", () => {
    expect(deserialize("- [x] done\n- [ ] open")).toMatchInlineSnapshot(`
      [
        {
          "checked": true,
          "children": [
            {
              "text": "done",
            },
          ],
          "indent": 1,
          "listStyleType": "todo",
          "type": "p",
        },
        {
          "checked": false,
          "children": [
            {
              "text": "open",
            },
          ],
          "indent": 1,
          "listStyleType": "todo",
          "type": "p",
        },
      ]
    `);
  });

  test("strikethrough", () => {
    expect(deserialize("~~gone~~")).toEqual([
      { children: [{ strikethrough: true, text: "gone" }], type: "p" },
    ]);
  });

  test("unbalanced angle brackets stay literal rather than throwing", () => {
    expect(deserialize("5 < 6 and 7 > 3")).toEqual([
      { children: [{ text: "5 < 6 and 7 > 3" }], type: "p" },
    ]);
  });
});

describe("the whole document", () => {
  test("a note using every feature serializes without throwing", () => {
    const everything = CASES.flatMap((entry) => entry.value) as Value;
    expect(() => serialize(everything)).not.toThrow();
    expect(serialize(everything)).toMatchInlineSnapshot(`
      "Plain text

      # H1

      ## H2

      ### H3

      #### H4

      ##### H5

      ###### H6

      **bold**

      _italic_

      <u>underline</u>

      ~~struck~~

      \`code\`

      <mark>highlight</mark>

      <kbd>kbd</kbd>

      - one
        - nested

      1. first
      2. second

      - [x] done
      - [ ] open

      > quoted

      \`\`\`ts
      const a = 1;
      \`\`\`

      | Task | Owner |
      | ---- | ----- |
      | Ship | amr   |

      see [docs](https://example.com)

      ---

      ![](devspace-note-asset://abc123.png)

      $$
      x^2 + y^2 = z^2
      $$
      "
    `);
  });
});

describe("what reaches the file", () => {
  const ZERO_WIDTH_SPACE = "​";

  test("empty paragraphs do not leave invisible characters behind", () => {
    // Plate writes a U+200B for each empty paragraph by default. The
    // trailing-block rule guarantees one after every non-paragraph last block,
    // so without this every note ending in an image or code block would carry a
    // zero-width space that grep and other editors show but nobody typed.
    const value = [
      { children: [text("")], type: "p" },
      { caption: [text("")], children: [text("")], type: "img", url: "a.png" },
      { children: [text("")], type: "p" },
    ] as Value;

    const markdown = serialize(value);

    expect(markdown).not.toContain(ZERO_WIDTH_SPACE);
    expect(markdown.trim()).toBe("![](a.png)");
  });

  test("a trailing empty paragraph becomes a blank line, not a hidden character", () => {
    // The trailing-block rule appends one of these to every note that ends in a
    // code block, table or image, so this is the common case, not an edge one.
    const value = [
      { children: [text("Body")], type: "p" },
      { children: [text("")], type: "p" },
    ] as Value;

    const markdown = serialize(value);

    expect(markdown).not.toContain(ZERO_WIDTH_SPACE);
    expect(markdown.trim()).toBe("Body");
  });
});

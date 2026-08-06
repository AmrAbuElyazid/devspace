// @vitest-environment jsdom

/**
 * Menus may only offer blocks the editor can actually make.
 *
 * "Turn into" shipped with Toggle list, Code Drawing and 3 columns, and the
 * plugins behind all three were absent from `createNoteEditorPlugins` — picking
 * one set a node type nothing could render. Nothing threw and nothing warned,
 * so the entries looked real. Both catalogues are now checked against the
 * registered plugin list.
 */

import { createSlateEditor, KEYS } from "platejs";
import { describe, expect, test } from "vitest";

import { createNoteEditorPlugins } from "../plugins/note-editor-kit";
import { slashItems } from "./slash-items";
import { LIST_TURN_INTO_VALUES, turnIntoItems } from "./turn-into-items";

const editor = createSlateEditor({ plugins: createNoteEditorPlugins() as never });

/** List styles are values for `toggleList`, not node types with their own plugin. */
const isRegistered = (value: string): boolean =>
  LIST_TURN_INTO_VALUES.has(value) || Boolean(editor.plugins[value]);

describe("turn into menu", () => {
  test("every entry maps to a registered plugin", () => {
    expect(turnIntoItems.filter((item) => !isRegistered(item.value)).map((i) => i.label)).toEqual(
      [],
    );
  });

  test("entries are unique", () => {
    const values = turnIntoItems.map((item) => item.value);
    expect(values).toHaveLength(new Set(values).size);
  });

  test("starts with plain text so the default selection is sane", () => {
    expect(turnIntoItems[0]?.value).toBe(KEYS.p);
  });
});

describe("slash menu", () => {
  test("every entry maps to a registered plugin", () => {
    expect(slashItems.filter((item) => !isRegistered(item.value)).map((i) => i.label)).toEqual([]);
  });

  test("entries are unique", () => {
    const values = slashItems.map((item) => item.value);
    expect(values).toHaveLength(new Set(values).size);
  });

  test("every entry carries search keywords", () => {
    expect(slashItems.filter((item) => item.keywords.length === 0).map((i) => i.label)).toEqual([]);
  });
});

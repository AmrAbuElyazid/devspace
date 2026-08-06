// @vitest-environment jsdom

import { DndPlugin } from "@platejs/dnd";
import { createSlateEditor } from "platejs";
import { describe, expect, test } from "vitest";

import { createNoteEditorPlugins } from "./note-editor-kit";

describe("dnd options", () => {
  test("the drag scroller stays off", () => {
    // Measured with a real cursor: with the scroller on, dropping onto the top
    // two blocks of a note failed 100% of the time. It renders an invisible
    // `position: fixed` strip 100px tall across the top and bottom of the
    // *window* at z-index 10000 while a drag is in flight, and swallows any
    // drop inside it. Devspace draws panes inside that window, so the strip
    // covered the tab bar and the start of every note.
    //
    // Synthetic input does not reproduce it — Playwright's drag bypasses the
    // hit test the overlay wins — so this asserts the option rather than the
    // behaviour. Re-enabling it needs a scroller scoped to the pane's own
    // scroll box.
    const editor = createSlateEditor({ plugins: createNoteEditorPlugins() as never });

    expect(editor.getOption(DndPlugin, "enableScroller")).toBe(false);
  });
});

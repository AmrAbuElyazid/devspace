// @vitest-environment jsdom

/**
 * The block gutter is the editor's only affordance for moving, duplicating or
 * deleting a block, so these assertions run against a real Plate editor rather
 * than a mocked one — the previous version stubbed `platejs` down to `KEYS` and
 * therefore could not have caught a gutter that renders but does nothing.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

import { createNoteEditorPlugins } from "../plugins/note-editor-kit";
import { Editor, EditorContainer } from "./editor";
import { TooltipProvider } from "./tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness({ value }: { value: Value }) {
  const editor = usePlateEditor({ plugins: createNoteEditorPlugins(), value });

  return (
    <TooltipProvider>
      <Plate editor={editor}>
        <EditorContainer>
          <Editor />
        </EditorContainer>
      </Plate>
    </TooltipProvider>
  );
}

function render(value: Value) {
  act(() => {
    root.render(<Harness value={value} />);
  });
}

const dragHandles = () =>
  container.querySelectorAll('button[aria-label="Drag to move, click to open block menu"]');
const insertButtons = () => container.querySelectorAll('button[aria-label="Insert block below"]');
const foldButtons = () => container.querySelectorAll('button[aria-label^="Collapse "]');

describe("block gutter", () => {
  test("gives every top level block a drag handle", () => {
    render([
      { children: [{ text: "First" }], type: "p" },
      { children: [{ text: "Second" }], type: "p" },
    ] as Value);

    expect(dragHandles()).toHaveLength(2);
    expect(insertButtons()).toHaveLength(2);
  });

  test("a heading trades the insert button for a fold chevron", () => {
    // The gutter only has room for two controls, and folding is the one that
    // has nowhere else to live — insert stays reachable from the block menu.
    render([{ children: [{ text: "Section" }], type: "h2" }] as Value);

    expect(foldButtons()).toHaveLength(1);
    expect(insertButtons()).toHaveLength(0);
    expect(dragHandles()).toHaveLength(1);
  });

  test("the drag handle stays draggable and opens the menu on click", () => {
    // Radix opens a dropdown on pointerdown and calls preventDefault while
    // doing so, which cancelled the native drag before it could start. The
    // handle now opens the menu from click, and the dropdown's own trigger is a
    // separate inert element, so both interactions survive.
    render([{ children: [{ text: "Block" }], type: "p" }] as Value);

    const handle = dragHandles()[0]! as HTMLButtonElement;
    expect(handle.draggable).toBe(true);

    act(() => handle.click());

    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  test("gives an empty paragraph a gutter too", () => {
    // The old implementation hid the handle whenever a paragraph was blank,
    // which left an empty block with no way to be moved or deleted.
    render([{ children: [{ text: "" }], type: "p" }] as Value);

    expect(dragHandles()).toHaveLength(1);
  });

  test("suppresses the gutter while a slash combobox is open in the block", () => {
    render([
      {
        children: [{ children: [{ text: "" }], type: "slash_input" }],
        type: "p",
      },
    ] as Value);

    expect(dragHandles()).toHaveLength(0);
  });

  test("does not wrap table parts, which move with their table", () => {
    render([
      {
        children: [
          {
            children: [{ children: [{ children: [{ text: "a" }], type: "p" }], type: "td" }],
            type: "tr",
          },
        ],
        type: "table",
      },
    ] as Value);

    // One handle for the table itself, none for the row or cell.
    expect(dragHandles()).toHaveLength(1);
  });
});

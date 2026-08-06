// @vitest-environment jsdom

/**
 * `NoteEditor` against a real Plate editor.
 *
 * The previous version stubbed `platejs`, `platejs/react` and the whole plate-ui
 * layer, which meant it asserted that the component called mocks in the right
 * order rather than that the editor did anything. Everything here goes through
 * the actual plugin stack.
 */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { NoteEditor, type NoteEditorChangeContext, type NoteEditorController } from "./NoteEditor";

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
  vi.restoreAllMocks();
});

/** Plate flushes `onChange` asynchronously; give React a frame to settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

/** jsdom performs no layout, so nothing ever reports a client rect. */
function pretendLaidOut() {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
    length: 1,
    item: () => null,
    [Symbol.iterator]: function* () {},
  } as unknown as DOMRectList);
}

test("deserializes markdown it is given and reports markdown back on change", async () => {
  const onChange = vi.fn<(ctx: NoteEditorChangeContext) => void>();
  const controllerRef = createRef<NoteEditorController>();

  act(() => {
    root.render(
      <NoteEditor
        initialValue={"# Title\n\nSome **bold** text"}
        onChange={onChange}
        controllerRef={controllerRef}
      />,
    );
  });

  expect(container.textContent).toContain("Title");
  expect(container.textContent).toContain("bold");

  act(() => {
    controllerRef.current?.replaceAll("Some", "Plenty of");
  });
  await settle();

  const last = onChange.mock.lastCall?.[0];
  expect(last?.serializationError).toBeNull();
  // Round-tripped through the plugin stack: the heading and the bold run are
  // still markdown, not flattened text.
  expect(last?.markdown).toContain("# Title");
  expect(last?.markdown).toContain("Plenty of **bold** text");
});

test("finds matches the way the highlighter does", () => {
  const controllerRef = createRef<NoteEditorController>();

  act(() => {
    root.render(
      <NoteEditor
        initialValue={"needle here\n\nand needle again"}
        onChange={() => {}}
        controllerRef={controllerRef}
        search="needle"
      />,
    );
  });

  expect(controllerRef.current?.matches("needle")).toHaveLength(2);
  expect(controllerRef.current?.matches("NEEDLE")).toHaveLength(2);
  expect(controllerRef.current?.matches("absent")).toHaveLength(0);
});

test("replaceAll rewrites every occurrence and reports how many", async () => {
  const onChange = vi.fn<(ctx: NoteEditorChangeContext) => void>();
  const controllerRef = createRef<NoteEditorController>();

  act(() => {
    root.render(
      <NoteEditor initialValue={"cat cat cat"} onChange={onChange} controllerRef={controllerRef} />,
    );
  });

  let replaced = 0;
  act(() => {
    replaced = controllerRef.current?.replaceAll("cat", "dog") ?? 0;
  });

  await settle();

  expect(replaced).toBe(3);
  expect(onChange.mock.lastCall?.[0].markdown?.trim()).toBe("dog dog dog");
});

test("does not autofocus a pane that is not on screen", async () => {
  // Inactive tab layers stay mounted under `display: none`; focusing one would
  // pull the caret out of whichever pane the user is actually typing in.
  act(() => {
    root.render(<NoteEditor initialValue="hidden pane" onChange={() => {}} autoFocus />);
  });
  await settle();

  expect(document.activeElement).toBe(document.body);
});

test("autofocuses once it has a layout box", async () => {
  pretendLaidOut();

  act(() => {
    root.render(<NoteEditor initialValue="visible pane" onChange={() => {}} autoFocus />);
  });
  await settle();

  const editable = container.querySelector("[data-slate-editor]");
  expect(document.activeElement).toBe(editable);
});

test("paints every match the find bar reports", async () => {
  // The counter is computed independently of the highlight plugin, so it stayed
  // correct while nothing was painted: setting a plugin option does not re-run
  // Slate's decorate on its own.
  const controllerRef = createRef<NoteEditorController>();

  act(() => {
    root.render(
      <NoteEditor
        initialValue="alpha beta alpha gamma alpha"
        onChange={() => {}}
        controllerRef={controllerRef}
        search="alpha"
      />,
    );
  });
  await settle();

  expect(container.querySelectorAll("[data-slate-editor] mark")).toHaveLength(3);
  expect(controllerRef.current?.matches("alpha")).toHaveLength(3);
});

test("clearing the query removes the highlights", async () => {
  act(() => {
    root.render(<NoteEditor initialValue="alpha beta" onChange={() => {}} search="alpha" />);
  });
  await settle();
  expect(container.querySelectorAll("[data-slate-editor] mark")).toHaveLength(1);

  act(() => {
    root.render(<NoteEditor initialValue="alpha beta" onChange={() => {}} search="" />);
  });
  await settle();
  expect(container.querySelectorAll("[data-slate-editor] mark")).toHaveLength(0);
});

test("revealing a match leaves focus where the caller put it", async () => {
  // The find bar calls this on every keystroke. Pulling focus into the document
  // would send the next character into the note, on top of the selected match —
  // the find input became unusable after one character and silently edited the
  // note with the rest.
  const controllerRef = createRef<NoteEditorController>();
  const outside = document.createElement("input");
  document.body.append(outside);

  act(() => {
    root.render(
      <NoteEditor
        initialValue="Deploy is gated on CI."
        onChange={() => {}}
        controllerRef={controllerRef}
      />,
    );
  });
  await settle();

  outside.focus();
  expect(document.activeElement).toBe(outside);

  act(() => {
    controllerRef.current?.revealMatch(controllerRef.current.matches("Deploy")[0]!);
  });
  await settle();

  expect(document.activeElement).toBe(outside);
  outside.remove();
});

test("reports the value and markdown before any edit", async () => {
  // Plate emits no change on mount, so the pane has to be able to ask. Without
  // it the footer read "0 words" and the outline claimed no headings.
  const controllerRef = createRef<NoteEditorController>();

  act(() => {
    root.render(
      <NoteEditor
        initialValue={"# Title\n\nSome text here"}
        onChange={() => {}}
        controllerRef={controllerRef}
      />,
    );
  });
  await settle();

  expect(controllerRef.current?.markdown()).toContain("# Title");
  expect(controllerRef.current?.value()?.[0]).toMatchObject({ type: "h1" });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";

import { useSidebarSelection } from "./useSidebarSelection";
import type { SidebarNode } from "../../types/workspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function workspace(workspaceId: string): SidebarNode {
  return { type: "workspace", workspaceId };
}

function folder(id: string, children: SidebarNode[], collapsed = false): SidebarNode {
  return { type: "folder", id, name: id, collapsed, children };
}

/** The bits of a React mouse event the hook reads. */
function click(modifiers: { meta?: boolean; shift?: boolean } = {}) {
  return {
    metaKey: modifiers.meta ?? false,
    ctrlKey: false,
    shiftKey: modifiers.shift ?? false,
    preventDefault: () => {},
  } as unknown as React.MouseEvent;
}

type Hook = ReturnType<typeof useSidebarSelection>;

let container: HTMLDivElement;
let root: Root | null;
let latest: Hook;
let activated: string[];

/**
 * Declared once at module scope on purpose. A component defined inside the
 * render helper would be a new type on every call, so React would remount
 * instead of re-render and every test of "what survives a tree change" would
 * pass for the wrong reason.
 */
function Probe({
  pinned,
  tree,
  filtered,
}: {
  pinned: SidebarNode[];
  tree: SidebarNode[];
  filtered: Set<string> | null;
}) {
  latest = useSidebarSelection(pinned, tree, filtered, (id) => activated.push(id));
  return null;
}

function render(
  pinned: SidebarNode[],
  tree: SidebarNode[],
  filtered: Set<string> | null = null,
): void {
  act(() => {
    root?.render(<Probe pinned={pinned} tree={tree} filtered={filtered} />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  activated = [];
});

afterEach(() => {
  act(() => {
    root?.unmount();
    root = null;
  });
  container.remove();
});

test("a plain click activates the workspace and leaves nothing selected", () => {
  render([], [workspace("a"), workspace("b")]);

  act(() => latest.handleWorkspaceClick("a", click()));

  expect(activated).toEqual(["a"]);
  expect([...latest.selectedKeys]).toEqual([]);
});

test("cmd-click toggles a row without opening it", () => {
  render([], [workspace("a"), workspace("b")]);

  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("b", click({ meta: true })));
  expect([...latest.selectedKeys].toSorted()).toEqual(["w:a", "w:b"]);
  expect(activated).toEqual([]);

  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  expect([...latest.selectedKeys]).toEqual(["w:b"]);
});

test("shift-click selects the visible range across pinned, folders and workspaces", () => {
  render([workspace("p")], [folder("f1", [workspace("a")]), workspace("b")]);

  act(() => latest.handleWorkspaceClick("p", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("b", click({ shift: true })));

  // Visual order is p, f1, a, b — the folder row is part of the range.
  expect([...latest.selectedKeys]).toEqual(["w:p", "f:f1", "w:a", "w:b"]);
});

test("a collapsed folder contributes itself but not its contents to a range", () => {
  render([], [workspace("a"), folder("f1", [workspace("hidden")], true), workspace("b")]);

  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("b", click({ shift: true })));

  expect([...latest.selectedKeys]).toEqual(["w:a", "f:f1", "w:b"]);
});

test("a range under an active search never reaches a filtered-out workspace", () => {
  // "b" is filtered out, so a range from a to c must skip it — otherwise a
  // bulk delete would take a workspace the user cannot see.
  render([], [workspace("a"), workspace("b"), workspace("c")], new Set(["a", "c"]));

  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("c", click({ shift: true })));

  expect([...latest.selectedKeys]).toEqual(["w:a", "w:c"]);
});

test("changing the search clears the selection", () => {
  const tree = [workspace("a"), workspace("b")];
  render([], tree);
  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  expect([...latest.selectedKeys]).toEqual(["w:a"]);

  render([], tree, new Set(["b"]));

  expect([...latest.selectedKeys]).toEqual([]);
});

test("folder clicks only consume the event when a modifier is held", () => {
  render([], [folder("f1", [])]);

  expect(latest.handleFolderClick("f1", click())).toBe(false);
  expect([...latest.selectedKeys]).toEqual([]);

  let consumed = false;
  act(() => {
    consumed = latest.handleFolderClick("f1", click({ meta: true }));
  });
  expect(consumed).toBe(true);
  expect([...latest.selectedKeys]).toEqual(["f:f1"]);
});

test("a row deleted elsewhere drops out of the selection", () => {
  const before = [workspace("a"), workspace("b")];
  render([], before);
  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("b", click({ meta: true })));

  render([], [workspace("b")]);

  expect([...latest.selectedKeys]).toEqual(["w:b"]);
});

test("collapsing a folder keeps the selection inside it", () => {
  render([], [folder("f1", [workspace("a")])]);
  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));

  render([], [folder("f1", [workspace("a")], true)]);

  expect([...latest.selectedKeys]).toEqual(["w:a"]);
});

test("actionTargets widens to the selection only for a row inside it", () => {
  render([], [workspace("a"), workspace("b"), workspace("c")]);
  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.handleWorkspaceClick("b", click({ meta: true })));

  expect(latest.actionTargets("w:a").toSorted()).toEqual(["w:a", "w:b"]);
  expect(latest.actionTargets("w:c")).toEqual(["w:c"]);
});

test("clear empties the selection", () => {
  render([], [workspace("a")]);
  act(() => latest.handleWorkspaceClick("a", click({ meta: true })));
  act(() => latest.clear());

  expect([...latest.selectedKeys]).toEqual([]);
});

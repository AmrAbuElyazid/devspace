// @vitest-environment jsdom

/**
 * A pane group keeps several tab layers mounted at once, so more than one
 * `NoteEditor` is live in the same window whenever a workspace has two note
 * panes. Each one mounts a `DndProvider` with react-dnd's HTML5 backend, which
 * is a per-window singleton that throws `Cannot have two HTML5 backends at the
 * same time` if it is ever set up twice.
 *
 * react-dnd caches the manager on `window` under a well-known symbol, so today
 * the providers share one backend and this holds. That caching is an internal
 * detail of the dependency, and the failure mode it protects against is a blank
 * pane behind an error boundary — cheap to pin down, expensive to rediscover.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";

import { NoteEditor } from "./NoteEditor";

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

const noop = () => {};

test("two editors mount side by side without fighting over the dnd backend", () => {
  expect(() => {
    act(() => {
      root.render(
        <>
          <NoteEditor initialValue="# First" onChange={noop} />
          <NoteEditor initialValue="# Second" onChange={noop} />
        </>,
      );
    });
  }).not.toThrow();

  expect(container.querySelectorAll("[data-slate-editor]")).toHaveLength(2);
});

test("an editor still mounts after a sibling editor unmounts", () => {
  act(() => {
    root.render(
      <>
        <NoteEditor initialValue="# First" onChange={noop} />
        <NoteEditor initialValue="# Second" onChange={noop} />
      </>,
    );
  });

  act(() => {
    root.render(<NoteEditor initialValue="# First" onChange={noop} />);
  });

  expect(() => {
    act(() => {
      root.render(
        <>
          <NoteEditor initialValue="# First" onChange={noop} />
          <NoteEditor initialValue="# Third" onChange={noop} />
        </>,
      );
    });
  }).not.toThrow();

  expect(container.querySelectorAll("[data-slate-editor]")).toHaveLength(2);
});

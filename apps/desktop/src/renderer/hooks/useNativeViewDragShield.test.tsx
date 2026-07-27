// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useNativeViewStore } from "../store/native-view-store";
import { resetDndState, setDndState } from "./useDndOrchestrator";
import {
  acquireNativeViewShield,
  releaseNativeViewShield,
  useNativeViewDragShield,
} from "./useNativeViewDragShield";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no PointerEvent, so the pointer stream is faked with MouseEvents
// carrying the pointer type names. React and addEventListener both dispatch on
// the type string, which is all these listeners look at.
function pointer(type: string, target: EventTarget, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

const setDragHidesViews = vi.fn();

let container: HTMLDivElement;
let root: Root | null;
let tabHandle: HTMLElement;
let folderHandle: HTMLElement;
let plainButton: HTMLElement;

function Harness() {
  useNativeViewDragShield();
  return null;
}

beforeEach(async () => {
  setDragHidesViews.mockClear();
  useNativeViewStore.setState({ setDragHidesViews });
  resetDndState();

  container = document.createElement("div");
  container.innerHTML = `
    <div data-sortable-id="gtab-tab-1"><span id="tab-label">Terminal</span></div>
    <div data-sortable-id="folder-folder-1"></div>
    <button id="plain">Plain</button>
  `;
  document.body.appendChild(container);
  tabHandle = container.querySelector("#tab-label") as HTMLElement;
  folderHandle = container.querySelector('[data-sortable-id="folder-folder-1"]') as HTMLElement;
  plainButton = container.querySelector("#plain") as HTMLElement;

  root = createRoot(document.createElement("div"));
  await act(async () => {
    root?.render(<Harness />);
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }
  resetDndState();
  container.remove();
});

test("hides the native views on the first move after a tab is pressed", () => {
  pointer("pointerdown", tabHandle);
  expect(setDragHidesViews).not.toHaveBeenCalled();

  // One pixel is enough — this happens long before dnd-kit's 6px activation
  // distance, which is the whole point.
  pointer("pointermove", tabHandle);

  expect(setDragHidesViews).toHaveBeenCalledExactlyOnceWith(true);
});

test("a click that never moves never hides anything", () => {
  pointer("pointerdown", tabHandle);
  pointer("pointerup", tabHandle);

  expect(setDragHidesViews).not.toHaveBeenCalled();
});

test("only hides once per press, however many moves arrive", () => {
  pointer("pointerdown", tabHandle);
  pointer("pointermove", tabHandle);
  pointer("pointermove", tabHandle);
  pointer("pointermove", tabHandle);

  expect(setDragHidesViews).toHaveBeenCalledExactlyOnceWith(true);
});

test("ignores presses that did not start on a drag handle", () => {
  pointer("pointerdown", plainButton);
  pointer("pointermove", plainButton);

  expect(setDragHidesViews).not.toHaveBeenCalled();
});

test("ignores folder drags, which never leave the sidebar", () => {
  pointer("pointerdown", folderHandle);
  pointer("pointermove", folderHandle);

  expect(setDragHidesViews).not.toHaveBeenCalled();
});

test("restores the views when the press ends without a drag starting", () => {
  pointer("pointerdown", tabHandle);
  pointer("pointermove", tabHandle);
  pointer("pointerup", tabHandle);

  expect(setDragHidesViews.mock.calls).toEqual([[true], [false]]);
});

test("leaves the views hidden if a dnd-kit drag is under way", () => {
  pointer("pointerdown", tabHandle);
  pointer("pointermove", tabHandle);

  setDndState({
    activeDrag: {
      type: "group-tab",
      workspaceId: "workspace-1",
      groupId: "group-1",
      tabId: "tab-1",
    },
  });

  // This capture-phase listener runs before dnd-kit's own pointerup handler.
  // Restoring here would flash the views back in and put them right under the
  // cursor at the moment of the drop; App's effect lifts them instead.
  pointer("pointerup", tabHandle);

  expect(setDragHidesViews).toHaveBeenCalledExactlyOnceWith(true);
});

test("an explicit hold keeps the views hidden until it is released", () => {
  acquireNativeViewShield();
  expect(setDragHidesViews).toHaveBeenCalledExactlyOnceWith(true);

  releaseNativeViewShield();
  expect(setDragHidesViews.mock.calls).toEqual([[true], [false]]);
});

test("a pointer release does not lift someone else's hold", () => {
  acquireNativeViewShield();
  pointer("pointerdown", tabHandle);
  pointer("pointermove", tabHandle);
  pointer("pointerup", tabHandle);

  expect(setDragHidesViews.mock.calls).toEqual([[true], [true]]);

  releaseNativeViewShield();
  expect(setDragHidesViews.mock.calls).toEqual([[true], [true], [false]]);
});

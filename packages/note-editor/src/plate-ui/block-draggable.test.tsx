// @vitest-environment jsdom

import { act } from "react";
import type { ComponentType, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const blockDraggableMocks = vi.hoisted(() => ({
  dragRef: vi.fn(),
  useDndNode: vi.fn(() => ({
    isDragging: false,
    dragRef: blockDraggableMocks.dragRef,
  })),
  useDropLine: vi.fn(() => ({ dropLine: "" })),
}));

vi.mock("@platejs/dnd", () => ({
  useDndNode: blockDraggableMocks.useDndNode,
  useDropLine: blockDraggableMocks.useDropLine,
}));

vi.mock("platejs", () => ({
  KEYS: {
    p: "p",
    codeLine: "codeLine",
    column: "column",
    slashInput: "slash_input",
    td: "td",
    th: "th",
    tr: "tr",
  },
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  blockDraggableMocks.dragRef.mockReset();
  blockDraggableMocks.useDndNode.mockClear();
  blockDraggableMocks.useDropLine.mockReset();
  blockDraggableMocks.useDropLine.mockReturnValue({ dropLine: "" });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }
  container.remove();
});

test("renders a drag handle for non-empty blocks and disables the native preview", async () => {
  const { BlockDraggable } = await import("./block-draggable");
  const Wrapper = BlockDraggable({
    element: { type: "p", children: [{ text: "Hello" }] } as never,
  }) as ComponentType<{ children: ReactNode }>;

  await act(async () => {
    root?.render(
      <Wrapper>
        <p>Hello</p>
      </Wrapper>,
    );
  });

  expect(blockDraggableMocks.useDndNode).toHaveBeenCalledWith(
    expect.objectContaining({
      preview: { disable: true },
    }),
  );
  expect(container.querySelector('button[aria-label="Drag block"]')).toBeTruthy();
});

test("does not render a drag handle for the empty default paragraph", async () => {
  const { BlockDraggable } = await import("./block-draggable");
  const Wrapper = BlockDraggable({
    element: { type: "p", children: [{ text: "   " }] } as never,
  }) as ComponentType<{ children: ReactNode }>;

  await act(async () => {
    root?.render(
      <Wrapper>
        <p />
      </Wrapper>,
    );
  });

  expect(container.querySelector('button[aria-label="Drag block"]')).toBeNull();
});

test("does not wrap slash input elements with a draggable handle", async () => {
  const { BlockDraggable } = await import("./block-draggable");

  expect(
    BlockDraggable({
      element: { type: "slash_input", children: [] } as never,
    }),
  ).toBeNull();
});

test("does not render a paragraph drag handle while slash input is active", async () => {
  const { BlockDraggable } = await import("./block-draggable");
  const Wrapper = BlockDraggable({
    element: {
      type: "p",
      children: [{ type: "slash_input", children: [{ text: "" }] }],
    } as never,
  }) as ComponentType<{ children: ReactNode }>;

  await act(async () => {
    root?.render(
      <Wrapper>
        <span>/</span>
      </Wrapper>,
    );
  });

  expect(container.querySelector('button[aria-label="Drag block"]')).toBeNull();
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const floatingToolbarMocks = vi.hoisted(() => ({
  markButtons: [] as Array<Record<string, unknown>>,
  linkButtons: [] as Array<Record<string, unknown>>,
  turnIntoButtons: 0,
  toolbarGroups: 0,
}));

vi.mock("platejs", () => ({
  KEYS: {
    bold: "bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "strikethrough",
    code: "code",
  },
}));

vi.mock("./toolbar", () => ({
  ToolbarGroup: ({ children }: { children?: React.ReactNode }) => {
    floatingToolbarMocks.toolbarGroups++;
    return <div>{children}</div>;
  },
}));

vi.mock("./turn-into-toolbar-button", () => ({
  TurnIntoToolbarButton: () => {
    floatingToolbarMocks.turnIntoButtons++;
    return <div data-testid="turn-into" />;
  },
}));

vi.mock("./mark-toolbar-button", () => ({
  MarkToolbarButton: (props: Record<string, unknown>) => {
    floatingToolbarMocks.markButtons.push(props);
    return <div>{props.children as React.ReactNode}</div>;
  },
}));

vi.mock("./link-toolbar-button", () => ({
  LinkToolbarButton: (props: Record<string, unknown>) => {
    floatingToolbarMocks.linkButtons.push(props);
    return <div data-testid="link-toolbar-button" />;
  },
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  floatingToolbarMocks.markButtons.length = 0;
  floatingToolbarMocks.linkButtons.length = 0;
  floatingToolbarMocks.turnIntoButtons = 0;
  floatingToolbarMocks.toolbarGroups = 0;
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

test("FloatingToolbarButtons renders the expected toolbar button set", async () => {
  const { FloatingToolbarButtons } = await import("./floating-toolbar-buttons");

  await act(async () => {
    root?.render(<FloatingToolbarButtons />);
  });

  expect(floatingToolbarMocks.toolbarGroups).toBe(1);
  expect(floatingToolbarMocks.turnIntoButtons).toBe(1);
  expect(floatingToolbarMocks.linkButtons).toHaveLength(1);
  expect(floatingToolbarMocks.markButtons.map((props) => props.nodeType)).toEqual([
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
  ]);
  expect(floatingToolbarMocks.markButtons.map((props) => props.tooltip)).toEqual([
    "Bold (⌘+B)",
    "Italic (⌘+I)",
    "Underline (⌘+U)",
    "Strikethrough (⌘+⇧+M)",
    "Code (⌘+E)",
  ]);
});

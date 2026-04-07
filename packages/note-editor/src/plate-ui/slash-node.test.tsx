// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slashNodeMocks = vi.hoisted(() => ({
  toggleList: vi.fn(),
  insertCallout: vi.fn(),
  insertCodeBlock: vi.fn(),
  plateElementProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("platejs", () => ({
  KEYS: {
    p: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    ul: "ul",
    ol: "ol",
    listTodo: "listTodo",
    codeBlock: "codeBlock",
    blockquote: "blockquote",
    callout: "callout",
    hr: "hr",
  },
}));

vi.mock("platejs/react", () => ({
  PlateElement: (props: Record<string, unknown>) => {
    slashNodeMocks.plateElementProps.push(props);
    return <div>{props.children as React.ReactNode}</div>;
  },
}));

vi.mock("@platejs/list", () => ({
  toggleList: slashNodeMocks.toggleList,
}));

vi.mock("@platejs/callout", () => ({
  insertCallout: slashNodeMocks.insertCallout,
}));

vi.mock("@platejs/code-block", () => ({
  insertCodeBlock: slashNodeMocks.insertCodeBlock,
}));

vi.mock("./inline-combobox", () => ({
  InlineCombobox: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InlineComboboxInput: () => <div data-testid="slash-input" />,
  InlineComboboxContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InlineComboboxEmpty: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InlineComboboxGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InlineComboboxGroupLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InlineComboboxItem: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  slashNodeMocks.toggleList.mockReset();
  slashNodeMocks.insertCallout.mockReset();
  slashNodeMocks.insertCodeBlock.mockReset();
  slashNodeMocks.plateElementProps.length = 0;
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

test("slash menu block actions dispatch through the editor helpers", async () => {
  const toggleBlock = vi.fn();
  const setNodes = vi.fn();
  const insertNodes = vi.fn();
  const editor = {
    tf: {
      toggleBlock,
      setNodes,
      insertNodes,
    },
  };

  const { SlashInputElement } = await import("./slash-node");
  const SlashInputElementComponent = SlashInputElement as unknown as React.ComponentType<{
    editor: unknown;
    element: unknown;
    attributes: unknown;
  }>;

  await act(async () => {
    root?.render(
      <SlashInputElementComponent
        editor={editor}
        element={{ type: "slash_input", children: [] }}
        attributes={{}}
      />,
    );
  });

  const clickButton = (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(label),
    );

    if (!button) {
      throw new Error(`Missing slash action button: ${label}`);
    }

    button.click();
  };

  clickButton("Text");
  clickButton("Bulleted list");
  clickButton("Code Block");
  clickButton("Blockquote");
  clickButton("Callout");
  clickButton("Divider");

  expect(toggleBlock).toHaveBeenCalledWith("p");
  expect(toggleBlock).toHaveBeenCalledWith("blockquote");
  expect(slashNodeMocks.toggleList).toHaveBeenCalledWith(editor, { listStyleType: "ul" });
  expect(slashNodeMocks.insertCodeBlock).toHaveBeenCalledWith(editor);
  expect(slashNodeMocks.insertCallout).toHaveBeenCalledWith(editor);
  expect(setNodes).toHaveBeenCalledWith({ type: "hr" });
  expect(insertNodes).toHaveBeenCalledWith({ children: [{ text: "" }], type: "p" });
});

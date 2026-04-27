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
  comboboxItemProps: [] as Array<Record<string, unknown>>,
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
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  } & Record<string, unknown>) => {
    slashNodeMocks.comboboxItemProps.push(props);
    return (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    );
  },
}));

let container: HTMLDivElement;
let root: Root | null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes('unique "key" prop')) return;
    console.warn(...args);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  slashNodeMocks.toggleList.mockReset();
  slashNodeMocks.insertCallout.mockReset();
  slashNodeMocks.insertCodeBlock.mockReset();
  slashNodeMocks.plateElementProps.length = 0;
  slashNodeMocks.comboboxItemProps.length = 0;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }
  container.remove();
  consoleErrorSpy.mockRestore();
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

test("slash menu exposes heading and list metadata and dispatches the remaining actions", async () => {
  const toggleBlock = vi.fn();
  const editor = {
    tf: {
      toggleBlock,
      setNodes: vi.fn(),
      insertNodes: vi.fn(),
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

  const findItemProps = (value: string) => {
    const itemProps = slashNodeMocks.comboboxItemProps.find((props) => props.value === value);
    if (!itemProps) {
      throw new Error(`Missing combobox item props for value: ${value}`);
    }
    return itemProps;
  };

  expect(findItemProps("h1")).toMatchObject({
    group: "Basic blocks",
    label: "Heading 1",
    keywords: ["title", "h1"],
  });
  expect(findItemProps("ol")).toMatchObject({
    label: "Numbered list",
    keywords: ["ordered", "ol", "1"],
  });
  expect(findItemProps("listTodo")).toMatchObject({
    label: "To-do list",
    keywords: ["checklist", "task", "checkbox", "[]"],
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

  clickButton("Heading 1");
  clickButton("Heading 2");
  clickButton("Heading 3");
  clickButton("Numbered list");
  clickButton("To-do list");

  expect(toggleBlock).toHaveBeenCalledWith("h1");
  expect(toggleBlock).toHaveBeenCalledWith("h2");
  expect(toggleBlock).toHaveBeenCalledWith("h3");
  expect(slashNodeMocks.toggleList).toHaveBeenCalledWith(editor, { listStyleType: "ol" });
  expect(slashNodeMocks.toggleList).toHaveBeenCalledWith(editor, { listStyleType: "listTodo" });
});

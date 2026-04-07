// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const turnIntoMocks = vi.hoisted(() => ({
  selectionValue: "p",
  editor: {
    tf: {
      focus: vi.fn(),
    },
  },
  setBlockType: vi.fn(),
  latestDropdownContentProps: null as null | Record<string, unknown>,
  latestToolbarMenuGroupProps: null as null | Record<string, unknown>,
}));

vi.mock("platejs", () => ({
  KEYS: {
    p: "p",
    ul: "ul",
    ol: "ol",
    listTodo: "listTodo",
    toggle: "toggle",
    codeBlock: "codeBlock",
    codeDrawing: "codeDrawing",
    blockquote: "blockquote",
  },
}));

vi.mock("platejs/react", () => ({
  useEditorRef: () => turnIntoMocks.editor,
  useSelectionFragmentProp: () => turnIntoMocks.selectionValue,
}));

vi.mock("../transforms", () => ({
  getBlockType: vi.fn(() => turnIntoMocks.selectionValue),
  setBlockType: turnIntoMocks.setBlockType,
}));

vi.mock("./dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children, ...props }: Record<string, unknown>) => {
    turnIntoMocks.latestDropdownContentProps = props;
    return <div>{children as ReactNode}</div>;
  },
  DropdownMenuRadioItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./toolbar", () => ({
  ToolbarButton: ({ children, pressed, isDropdown, ...props }: Record<string, unknown>) => (
    <button
      {...props}
      data-is-dropdown={isDropdown ? "true" : undefined}
      data-pressed={pressed ? "true" : undefined}
    >
      {children as ReactNode}
    </button>
  ),
  ToolbarMenuGroup: ({ children, ...props }: Record<string, unknown>) => {
    turnIntoMocks.latestToolbarMenuGroupProps = props;
    return <div>{children as ReactNode}</div>;
  },
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  turnIntoMocks.selectionValue = "p";
  turnIntoMocks.editor.tf.focus.mockReset();
  turnIntoMocks.setBlockType.mockReset();
  turnIntoMocks.latestDropdownContentProps = null;
  turnIntoMocks.latestToolbarMenuGroupProps = null;
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

test("shows the selected block label and falls back to Text for unknown values", async () => {
  const { TurnIntoToolbarButton } = await import("./turn-into-toolbar-button");

  turnIntoMocks.selectionValue = "h2";
  await act(async () => {
    root?.render(<TurnIntoToolbarButton />);
  });
  expect(container.textContent).toContain("Heading 2");

  turnIntoMocks.selectionValue = "not-a-real-type";
  await act(async () => {
    root?.render(<TurnIntoToolbarButton />);
  });
  expect(container.textContent).toContain("Text");
});

test("restores editor focus when the dropdown closes", async () => {
  const { TurnIntoToolbarButton } = await import("./turn-into-toolbar-button");

  await act(async () => {
    root?.render(<TurnIntoToolbarButton />);
  });

  const preventDefault = vi.fn();
  const onCloseAutoFocus = turnIntoMocks.latestDropdownContentProps?.onCloseAutoFocus as
    | ((event: { preventDefault: () => void }) => void)
    | undefined;
  onCloseAutoFocus?.({ preventDefault });

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(turnIntoMocks.editor.tf.focus).toHaveBeenCalledTimes(1);
});

test("changes the current block type through setBlockType", async () => {
  const { TurnIntoToolbarButton } = await import("./turn-into-toolbar-button");

  await act(async () => {
    root?.render(<TurnIntoToolbarButton />);
  });

  const onValueChange = turnIntoMocks.latestToolbarMenuGroupProps?.onValueChange as
    | ((value: string) => void)
    | undefined;
  onValueChange?.("blockquote");

  expect(turnIntoMocks.setBlockType).toHaveBeenCalledWith(turnIntoMocks.editor, "blockquote");
});

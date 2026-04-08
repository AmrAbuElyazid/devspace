// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestStoreState = {
  activeId: string | null;
  items: Array<{ id: string }>;
  value: string;
};

const inlineComboboxMocks = vi.hoisted(() => {
  return {
    inputProps: { "data-testid": "inline-combobox-input" },
    providerOpens: [] as boolean[],
    removeInput: vi.fn(),
    storeState: {
      activeId: null,
      items: [] as Array<{ id: string }>,
      value: "",
    } as TestStoreState,
  };
});

vi.mock("@platejs/combobox", () => ({
  filterWords: (keyword: string, search: string) =>
    keyword.toLowerCase().includes(search.trim().toLowerCase()),
}));

vi.mock("@platejs/combobox/react", () => ({
  useComboboxInput: () => ({
    props: inlineComboboxMocks.inputProps,
    removeInput: inlineComboboxMocks.removeInput,
  }),
  useHTMLInputCursorState: () => ({}) as unknown,
}));

vi.mock("platejs/react", async () => {
  return {
    useComposedRef:
      (...refs: Array<import("react").Ref<HTMLElement> | undefined>) =>
      (value: HTMLElement | null) => {
        for (const ref of refs) {
          if (typeof ref === "function") {
            ref(value);
          } else if (ref && typeof ref === "object") {
            (ref as import("react").MutableRefObject<HTMLElement | null>).current = value;
          }
        }
      },
    useEditorRef: () => ({
      api: {
        before: () => null,
        findPath: () => [0],
        pointRef: () => ({ current: null, unref: vi.fn() }),
      },
      meta: { userId: "user-1" },
      tf: {
        insertText: vi.fn(),
        move: vi.fn(),
      },
    }),
  };
});

vi.mock("@ariakit/react", async () => {
  const React = await import("react");

  const ComboboxContext = React.createContext<any>(null);

  return {
    Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    ComboboxProvider: ({
      children,
      open,
      store,
    }: {
      children?: React.ReactNode;
      open: boolean;
      store: unknown;
    }) => {
      inlineComboboxMocks.providerOpens.push(open);
      return <ComboboxContext.Provider value={store}>{children}</ComboboxContext.Provider>;
    },
    ComboboxPopover: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    ComboboxGroup: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    ComboboxGroupLabel: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    ComboboxRow: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    Combobox: React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
      function MockCombobox({ autoSelect: _autoSelect, onChange, value, ...props }: any, ref) {
        return <input ref={ref} onChange={onChange ?? (() => {})} value={value} {...props} />;
      },
    ),
    ComboboxItem: ({
      children,
      onClick,
      value,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value?: string }) => (
      <button type="button" onClick={onClick} data-value={value} {...props}>
        {children}
      </button>
    ),
    useComboboxContext: () => React.useContext(ComboboxContext),
    useComboboxStore: () => ({
      first: () => inlineComboboxMocks.storeState.items[0]?.id ?? null,
      getState: () => inlineComboboxMocks.storeState,
      last: () => inlineComboboxMocks.storeState.items.at(-1)?.id ?? null,
      setActiveId: (activeId: string | null) => {
        inlineComboboxMocks.storeState.activeId = activeId;
      },
      useState: (key: keyof typeof inlineComboboxMocks.storeState) =>
        inlineComboboxMocks.storeState[key],
    }),
  };
});

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  inlineComboboxMocks.providerOpens.length = 0;
  inlineComboboxMocks.removeInput.mockReset();
  inlineComboboxMocks.storeState = {
    activeId: null,
    items: [],
    value: "",
  } as TestStoreState;
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

test("filters items by label and keywords and controls editor focus on selection", async () => {
  inlineComboboxMocks.storeState = {
    activeId: null,
    items: [{ id: "item-1" }],
    value: "numbered",
  } as TestStoreState;

  const onNumberedListClick = vi.fn();
  const onBulletedListClick = vi.fn();
  const { InlineCombobox, InlineComboboxContent, InlineComboboxGroup, InlineComboboxItem } =
    await import("./inline-combobox");

  await act(async () => {
    root?.render(
      <InlineCombobox
        element={{ type: "slash_input", children: [], userId: "user-1" } as any}
        trigger="/"
      >
        <InlineComboboxContent>
          <InlineComboboxGroup>
            <InlineComboboxItem
              value="ol"
              label="Numbered list"
              keywords={["ordered", "ol", "1"]}
              focusEditor={false}
              onClick={onNumberedListClick}
            >
              Numbered list
            </InlineComboboxItem>
            <InlineComboboxItem
              value="ul"
              label="Bulleted list"
              keywords={["unordered", "ul", "-"]}
              onClick={onBulletedListClick}
            >
              Bulleted list
            </InlineComboboxItem>
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>,
    );
  });

  const buttons = Array.from(container.querySelectorAll("button"));
  expect(buttons).toHaveLength(1);
  expect(buttons[0]?.textContent).toContain("Numbered list");

  await act(async () => {
    buttons[0]?.click();
  });

  expect(inlineComboboxMocks.removeInput).toHaveBeenCalledWith(false);
  expect(onNumberedListClick).toHaveBeenCalledTimes(1);
  expect(onBulletedListClick).not.toHaveBeenCalled();
});

test("shows the empty state when no items remain and hides it once results exist", async () => {
  const { InlineCombobox, InlineComboboxContent, InlineComboboxEmpty, InlineComboboxInput } =
    await import("./inline-combobox");

  await act(async () => {
    root?.render(
      <InlineCombobox
        element={{ type: "slash_input", children: [], userId: "user-1" } as any}
        trigger="/"
      >
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>
        </InlineComboboxContent>
      </InlineCombobox>,
    );
  });

  expect(container.textContent?.replace(/\u200B/g, "")).toContain("/No results");
  expect(inlineComboboxMocks.providerOpens.at(-1)).toBe(true);

  inlineComboboxMocks.storeState = {
    activeId: "item-1",
    items: [{ id: "item-1" }],
    value: "ordered",
  } as TestStoreState;

  await act(async () => {
    root?.render(
      <InlineCombobox
        element={{ type: "slash_input", children: [], userId: "user-1" } as any}
        trigger="/"
      >
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>
        </InlineComboboxContent>
      </InlineCombobox>,
    );
  });

  expect(container.textContent).not.toContain("No results");
});

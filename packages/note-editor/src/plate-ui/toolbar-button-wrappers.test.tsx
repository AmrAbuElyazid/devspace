// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toolbarWrapperMocks = vi.hoisted(() => ({
  markState: { kind: "mark-state" },
  linkState: { kind: "link-state" },
  useMarkToolbarButtonState: vi.fn(() => ({ kind: "mark-state" })),
  useMarkToolbarButton: vi.fn(() => ({ props: { "data-mark-prop": "from-hook" } })),
  useLinkToolbarButtonState: vi.fn(() => ({ kind: "link-state" })),
  useLinkToolbarButton: vi.fn(() => ({ props: { "data-link-prop": "from-hook" } })),
  toolbarButtonProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("platejs/react", () => ({
  useMarkToolbarButtonState: toolbarWrapperMocks.useMarkToolbarButtonState,
  useMarkToolbarButton: toolbarWrapperMocks.useMarkToolbarButton,
}));

vi.mock("@platejs/link/react", () => ({
  useLinkToolbarButtonState: toolbarWrapperMocks.useLinkToolbarButtonState,
  useLinkToolbarButton: toolbarWrapperMocks.useLinkToolbarButton,
}));

vi.mock("lucide-react", () => ({
  Link: () => <svg data-testid="link-icon" />,
}));

vi.mock("./toolbar", () => ({
  ToolbarButton: (props: Record<string, unknown>) => {
    toolbarWrapperMocks.toolbarButtonProps.push(props);
    return <button>{props.children as string | undefined}</button>;
  },
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  toolbarWrapperMocks.toolbarButtonProps.length = 0;
  toolbarWrapperMocks.useMarkToolbarButtonState.mockClear();
  toolbarWrapperMocks.useMarkToolbarButton.mockClear();
  toolbarWrapperMocks.useLinkToolbarButtonState.mockClear();
  toolbarWrapperMocks.useLinkToolbarButton.mockClear();
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

test("MarkToolbarButton wires state and hook props into ToolbarButton", async () => {
  const { MarkToolbarButton } = await import("./mark-toolbar-button");

  await act(async () => {
    root?.render(
      <MarkToolbarButton nodeType="bold" clear={["italic"]} tooltip="Bold">
        Bold
      </MarkToolbarButton>,
    );
  });

  expect(toolbarWrapperMocks.useMarkToolbarButtonState).toHaveBeenCalledWith({
    clear: ["italic"],
    nodeType: "bold",
  });
  expect(toolbarWrapperMocks.useMarkToolbarButton).toHaveBeenCalledWith({ kind: "mark-state" });
  expect(toolbarWrapperMocks.toolbarButtonProps[0]).toMatchObject({
    tooltip: "Bold",
    children: "Bold",
    "data-mark-prop": "from-hook",
  });
});

test("LinkToolbarButton wires hook props and default focus metadata", async () => {
  const { LinkToolbarButton } = await import("./link-toolbar-button");

  await act(async () => {
    root?.render(<LinkToolbarButton aria-label="link-button" />);
  });

  expect(toolbarWrapperMocks.useLinkToolbarButtonState).toHaveBeenCalledTimes(1);
  expect(toolbarWrapperMocks.useLinkToolbarButton).toHaveBeenCalledWith({ kind: "link-state" });
  expect(toolbarWrapperMocks.toolbarButtonProps[0]).toMatchObject({
    "aria-label": "link-button",
    "data-link-prop": "from-hook",
    "data-plate-focus": true,
    tooltip: "Link",
  });
});

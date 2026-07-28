// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const positionerProps: Array<Record<string, unknown>> = [];

const Part = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

// Only the Positioner matters here — it is the part that receives the
// collision boundary. Everything else is a passthrough so the tree renders.
vi.mock("@base-ui-components/react/tooltip", () => ({
  Tooltip: {
    Provider: Part,
    Root: Part,
    Trigger: Part,
    Portal: Part,
    Popup: Part,
    Arrow: Part,
    Positioner: ({ children, ...props }: { children?: React.ReactNode }) => {
      positionerProps.push(props);
      return <div>{children}</div>;
    },
  },
}));

const { Tooltip, TooltipContent, TooltipBoundaryProvider } = await import("./tooltip");

function renderTip(boundary: Element | null) {
  positionerProps.length = 0;
  renderToStaticMarkup(
    <TooltipBoundaryProvider boundary={boundary}>
      <Tooltip>
        <TooltipContent>hint</TooltipContent>
      </Tooltip>
    </TooltipBoundaryProvider>,
  );
  return positionerProps.at(-1) ?? {};
}

test("confines the tooltip to a declared boundary", () => {
  // The sidebar sits against native views that paint above the web contents,
  // so a tooltip allowed to spill past its edge disappears rather than being
  // clipped. The boundary is what keeps it on the rail.
  const sidebar = document.createElement("aside");
  const props = renderTip(sidebar);

  expect(props.collisionBoundary).toBe(sidebar);
  expect(props.collisionPadding).toBe(8);
});

test("leaves positioning alone where nothing declares a boundary", () => {
  const props = renderTip(null);

  expect("collisionBoundary" in props).toBe(false);
  expect("collisionPadding" in props).toBe(false);
});

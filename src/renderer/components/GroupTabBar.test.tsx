import { expect, vi, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GroupTabBar, { handleTabBarWindowZoomDoubleClick } from "./GroupTabBar";

test("renders a draggable spacer for empty tab bar space", () => {
  const html = renderToStaticMarkup(
    <div>
      <GroupTabBar
        group={{
          id: "group-1",
          activeTabId: "tab-1",
          tabs: [{ id: "tab-1", paneId: "pane-1" }],
        }}
        groupId="group-1"
        workspaceId="workspace-1"
        isFocused={true}
        dndEnabled={true}
      />
    </div>,
  );

  expect(html).toContain("group-tabbar-drag-spacer");
  expect(html).toContain("drag-region");
});

test("double clicking empty tab bar space toggles window zoom", () => {
  const maximize = vi.fn(() => {});
  const stopPropagation = vi.fn(() => {});

  handleTabBarWindowZoomDoubleClick({ detail: 2, stopPropagation } as unknown as React.MouseEvent, {
    maximize,
  });

  expect(maximize).toHaveBeenCalledTimes(1);
  expect(stopPropagation).toHaveBeenCalledTimes(1);
});

test("single clicks on empty tab bar space do not toggle window zoom", () => {
  const maximize = vi.fn(() => {});
  const stopPropagation = vi.fn(() => {});

  handleTabBarWindowZoomDoubleClick({ detail: 1, stopPropagation } as unknown as React.MouseEvent, {
    maximize,
  });

  expect(maximize).toHaveBeenCalledTimes(0);
  expect(stopPropagation).toHaveBeenCalledTimes(0);
});

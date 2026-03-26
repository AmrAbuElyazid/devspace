import { test, expect } from "vitest";
import { shouldHideBrowserNativeViewForDrag } from "../lib/browser-pane-visibility";

test("shouldHideBrowserNativeViewForDrag only hides during active group-tab drag on the visible tab", () => {
  expect(
    shouldHideBrowserNativeViewForDrag(
      { type: "group-tab", workspaceId: "ws-1", groupId: "group-1", tabId: "tab-1" },
      true,
    ),
  ).toBe(true);
  expect(
    shouldHideBrowserNativeViewForDrag(
      { type: "sidebar-workspace", workspaceId: "ws-1", container: "main", parentFolderId: null },
      true,
    ),
  ).toBe(false);
  expect(shouldHideBrowserNativeViewForDrag(null, true)).toBe(false);
  expect(
    shouldHideBrowserNativeViewForDrag(
      { type: "group-tab", workspaceId: "ws-1", groupId: "group-1", tabId: "tab-1" },
      false,
    ),
  ).toBe(false);
});

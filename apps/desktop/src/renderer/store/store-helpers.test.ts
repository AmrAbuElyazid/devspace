import { expect, test } from "vitest";
import { insertNodeIntoSidebarContainer } from "./store-helpers";

test("insertNodeIntoSidebarContainer inserts into the main sidebar tree", () => {
  const result = insertNodeIntoSidebarContainer(
    {
      sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
      pinnedSidebarNodes: [{ type: "workspace", workspaceId: "pinned-ws" }],
    },
    "main",
    { type: "workspace", workspaceId: "ws-2" },
    null,
    1,
  );

  expect(result.sidebarTree).toEqual([
    { type: "workspace", workspaceId: "ws-1" },
    { type: "workspace", workspaceId: "ws-2" },
  ]);
  expect(result.pinnedSidebarNodes).toEqual([{ type: "workspace", workspaceId: "pinned-ws" }]);
});

test("insertNodeIntoSidebarContainer inserts into a folder in the pinned container", () => {
  const result = insertNodeIntoSidebarContainer(
    {
      sidebarTree: [{ type: "workspace", workspaceId: "main-ws" }],
      pinnedSidebarNodes: [
        {
          type: "folder",
          id: "folder-1",
          name: "Pinned Folder",
          collapsed: false,
          children: [],
        },
      ],
    },
    "pinned",
    { type: "workspace", workspaceId: "ws-2" },
    "folder-1",
    0,
  );

  expect(result.sidebarTree).toEqual([{ type: "workspace", workspaceId: "main-ws" }]);
  expect(result.pinnedSidebarNodes).toEqual([
    {
      type: "folder",
      id: "folder-1",
      name: "Pinned Folder",
      collapsed: false,
      children: [{ type: "workspace", workspaceId: "ws-2" }],
    },
  ]);
});

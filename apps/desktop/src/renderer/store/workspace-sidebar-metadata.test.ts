import { expect, test } from "vitest";
import { buildWorkspaceSidebarMetadataByWorkspaceId } from "./workspace-sidebar-metadata";

test("buildWorkspaceSidebarMetadataByWorkspaceId includes pane count, primary dir, and relative time", () => {
  const now = Date.now();
  const metadata = buildWorkspaceSidebarMetadataByWorkspaceId(
    [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: now - 5 * 60 * 1000,
      },
    ],
    {
      "pane-1": {
        id: "pane-1",
        type: "terminal",
        title: "Terminal",
        config: { cwd: "/Users/test/project-a" },
      },
      "pane-2": {
        id: "pane-2",
        type: "editor",
        title: "Editor",
        config: { folderPath: "/Users/test/project-b" },
      },
    },
    {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [
          { id: "tab-1", paneId: "pane-1" },
          { id: "tab-2", paneId: "pane-2" },
        ],
      },
    },
  );

  expect(metadata["workspace-1"]).toBe("2 panes · project-a · 5m ago");
});

test("buildWorkspaceSidebarMetadataByWorkspaceId falls back to time-only metadata", () => {
  const metadata = buildWorkspaceSidebarMetadataByWorkspaceId(
    [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    {},
    {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [],
      },
    },
  );

  expect(metadata["workspace-1"]).toBe("now");
});

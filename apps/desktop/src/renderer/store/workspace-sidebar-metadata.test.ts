import { expect, test } from "vitest";
import { buildWorkspaceSidebarMetadataByWorkspaceId } from "./workspace-sidebar-metadata";

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: "workspace-1",
    name: "Workspace 1",
    root: { type: "leaf" as const, groupId: "group-1" },
    focusedGroupId: "group-1",
    zoomedGroupId: null,
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

test("counts panes and takes the first terminal's directory", () => {
  const info = buildWorkspaceSidebarMetadataByWorkspaceId(
    [workspace()],
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

  // The full path, not a basename: the row truncates from the left itself.
  expect(info["workspace-1"]).toEqual({ paneCount: 2, directory: "/Users/test/project-a" });
});

test("falls back to an editor folder when there is no terminal", () => {
  const info = buildWorkspaceSidebarMetadataByWorkspaceId(
    [workspace()],
    {
      "pane-1": {
        id: "pane-1",
        type: "editor",
        title: "Editor",
        config: { folderPath: "/Users/test/only-editor" },
      },
    },
    {
      "group-1": { id: "group-1", activeTabId: "tab-1", tabs: [{ id: "tab-1", paneId: "pane-1" }] },
    },
  );

  expect(info["workspace-1"]).toEqual({ paneCount: 1, directory: "/Users/test/only-editor" });
});

test("falls back to the workspace's last terminal cwd when no pane carries one", () => {
  // A workspace whose panes are all browsers should still say where it lives.
  const info = buildWorkspaceSidebarMetadataByWorkspaceId(
    [workspace({ lastTerminalCwd: "/Users/test/remembered" })],
    {
      "pane-1": {
        id: "pane-1",
        type: "browser",
        title: "Browser",
        config: { url: "https://example.com" },
      },
    },
    {
      "group-1": { id: "group-1", activeTabId: "tab-1", tabs: [{ id: "tab-1", paneId: "pane-1" }] },
    },
  );

  expect(info["workspace-1"]).toEqual({ paneCount: 1, directory: "/Users/test/remembered" });
});

test("an empty workspace reports no panes and no directory", () => {
  const info = buildWorkspaceSidebarMetadataByWorkspaceId(
    [workspace()],
    {},
    { "group-1": { id: "group-1", activeTabId: "tab-1", tabs: [] } },
  );

  expect(info["workspace-1"]).toEqual({ paneCount: 0, directory: null });
});

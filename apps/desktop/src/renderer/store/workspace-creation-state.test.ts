import { expect, test } from "vitest";
import type { Pane } from "../types/workspace";
import {
  createWorkspaceEntryFromPane,
  createWorkspaceEntryFromPaneId,
  insertWorkspaceIntoSidebarState,
  resolveWorkspaceTabCreationContext,
} from "./workspace-creation-state";

test("createWorkspaceEntryFromPane creates a workspace focused on the new pane group", () => {
  const pane: Pane = {
    id: "pane-1",
    type: "terminal",
    title: "Terminal",
    config: {},
  };

  const result = createWorkspaceEntryFromPane("Workspace A", pane);

  expect(result.group.tabs).toEqual([{ id: result.group.activeTabId, paneId: "pane-1" }]);
  expect(result.workspace.name).toBe("Workspace A");
  expect(result.workspace.root).toEqual({ type: "leaf", groupId: result.group.id });
  expect(result.workspace.focusedGroupId).toBe(result.group.id);
});

test("createWorkspaceEntryFromPaneId reuses the provided pane id", () => {
  const result = createWorkspaceEntryFromPaneId("Workspace B", "pane-2");

  expect(result.group.tabs).toEqual([{ id: result.group.activeTabId, paneId: "pane-2" }]);
  expect(result.workspace.name).toBe("Workspace B");
});

test("insertWorkspaceIntoSidebarState appends to the selected container by default", () => {
  const result = insertWorkspaceIntoSidebarState(
    {
      sidebarTree: [{ type: "workspace", workspaceId: "ws-1" }],
      pinnedSidebarNodes: [],
    },
    "ws-2",
  );

  expect(result.sidebarTree).toEqual([
    { type: "workspace", workspaceId: "ws-1" },
    { type: "workspace", workspaceId: "ws-2" },
  ]);
  expect(result.pinnedSidebarNodes).toEqual([]);
});

test("resolveWorkspaceTabCreationContext returns the source workspace, group, tab, and pane", () => {
  const result = resolveWorkspaceTabCreationContext(
    {
      workspaces: [
        {
          id: "ws-1",
          name: "One",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
      ],
      paneGroups: {
        "group-1": {
          id: "group-1",
          tabs: [{ id: "tab-1", paneId: "pane-1" }],
          activeTabId: "tab-1",
        },
      },
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "browser",
          title: "Browser",
          config: { url: "https://example.com" },
        },
      },
    },
    "ws-1",
    "group-1",
    "tab-1",
  );

  expect(result?.sourceWorkspace.id).toBe("ws-1");
  expect(result?.sourceGroup.id).toBe("group-1");
  expect(result?.tab.id).toBe("tab-1");
  expect(result?.pane.id).toBe("pane-1");
});

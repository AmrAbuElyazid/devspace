import { test, expect } from "vitest";
import {
  getActiveFocusedBrowserPane,
  getActiveFocusedWebViewPane,
  getSplitShortcutTargetGroupId,
} from "./browser-shortcuts";

test("returns the focused browser pane via the active group tab", () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: "ws-1",
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        type: "browser",
        title: "Browser",
        config: { url: "https://one.example" },
      },
      "pane-2": {
        id: "pane-2",
        type: "browser",
        title: "Browser",
        config: { url: "https://two.example" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        tabs: [
          { id: "tab-1", paneId: "pane-1" },
          { id: "tab-2", paneId: "pane-2" },
        ],
        activeTabId: "tab-2",
      },
    },
  });

  expect(pane?.id).toBe("pane-2");
});

test("falls back to the first group when no group is focused", () => {
  const pane = getActiveFocusedBrowserPane({
    activeWorkspaceId: "ws-1",
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: null,
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        type: "browser",
        title: "Browser",
        config: { url: "https://one.example" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
    },
  });

  expect(pane?.id).toBe("pane-1");
});

test("getActiveFocusedBrowserPane returns null for editor pane", () => {
  const state = {
    activeWorkspaceId: "ws-1",
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace 1",
        root: { type: "leaf" as const, groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        type: "editor" as const,
        title: "Editor",
        config: { folderPath: "/path/to/project" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
    },
  };

  // Browser-specific function should NOT match editor panes
  expect(getActiveFocusedBrowserPane(state)).toBeNull();
  // WebView function SHOULD match editor panes (for zoom)
  expect(getActiveFocusedWebViewPane(state)?.id).toBe("pane-1");
});

test("getActiveFocusedWebViewPane returns t3code pane", () => {
  const state = {
    activeWorkspaceId: "ws-1",
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace 1",
        root: { type: "leaf" as const, groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        type: "t3code" as const,
        title: "T3 Code",
        config: { url: "https://t3code.example" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
    },
  };

  // Browser-specific function should NOT match t3code panes
  expect(getActiveFocusedBrowserPane(state)).toBeNull();
  // WebView function SHOULD match t3code panes (for zoom)
  expect(getActiveFocusedWebViewPane(state)?.id).toBe("pane-1");
});

test("split shortcuts fall back to the first group when no group is focused", () => {
  const groupId = getSplitShortcutTargetGroupId({
    id: "ws-1",
    name: "Workspace 1",
    focusedGroupId: null,
    zoomedGroupId: null,
    lastActiveAt: Date.now(),
    root: {
      type: "branch",
      direction: "horizontal",
      sizes: [50, 50],
      children: [
        { type: "leaf", groupId: "group-1" },
        { type: "leaf", groupId: "group-2" },
      ],
    },
  });

  expect(groupId).toBe("group-1");
});

import { beforeEach, expect, test } from "vitest";
import {
  syncWorkspaceFocusForNativeNotification,
  syncWorkspaceFocusForPane,
} from "./native-pane-focus";
import { useNativeViewStore } from "../store/native-view-store";
import { useWorkspaceStore } from "../store/workspace-store";
import { buildPaneOwnersByPaneId } from "../store/pane-ownership";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

beforeEach(() => {
  const workspaces: Workspace[] = [
    {
      id: "workspace-1",
      name: "Workspace 1",
      root: { type: "leaf", groupId: "group-1" },
      focusedGroupId: "group-1",
      zoomedGroupId: null,
      lastActiveAt: 1,
    },
    {
      id: "workspace-2",
      name: "Workspace 2",
      root: {
        type: "branch",
        direction: "horizontal",
        children: [
          { type: "leaf", groupId: "group-2" },
          { type: "leaf", groupId: "group-3" },
        ],
        sizes: [0.5, 0.5],
      },
      focusedGroupId: "group-3",
      zoomedGroupId: null,
      lastActiveAt: 2,
    },
  ];

  const paneGroups: Record<string, PaneGroup> = {
    "group-1": {
      id: "group-1",
      activeTabId: "tab-1",
      tabs: [{ id: "tab-1", paneId: "pane-1" }],
    },
    "group-2": {
      id: "group-2",
      activeTabId: "tab-3",
      tabs: [
        { id: "tab-2", paneId: "pane-2" },
        { id: "tab-3", paneId: "pane-3" },
      ],
    },
    "group-3": {
      id: "group-3",
      activeTabId: "tab-4",
      tabs: [{ id: "tab-4", paneId: "pane-4" }],
    },
  };

  const panes: Record<string, Pane> = {
    "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    "pane-2": {
      id: "pane-2",
      title: "Browser",
      type: "browser",
      config: { url: "https://example.com" },
    },
    "pane-3": { id: "pane-3", title: "Note", type: "note", config: { noteId: "note-3" } },
    "pane-4": { id: "pane-4", title: "Editor", type: "editor", config: {} },
  };

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces,
    paneGroups,
    panes,
    paneOwnersByPaneId: buildPaneOwnersByPaneId(workspaces, paneGroups),
  });
});

test("syncWorkspaceFocusForPane activates the pane's workspace, group, and tab", () => {
  syncWorkspaceFocusForPane("pane-2");

  const state = useWorkspaceStore.getState();
  expect(state.activeWorkspaceId).toBe("workspace-2");
  expect(state.workspaces.find((workspace) => workspace.id === "workspace-2")?.focusedGroupId).toBe(
    "group-2",
  );
  expect(state.paneGroups["group-2"]?.activeTabId).toBe("tab-2");
});

test("syncWorkspaceFocusForPane ignores unknown panes", () => {
  syncWorkspaceFocusForPane("missing-pane");

  const state = useWorkspaceStore.getState();
  expect(state.activeWorkspaceId).toBe("workspace-1");
  expect(state.workspaces.find((workspace) => workspace.id === "workspace-2")?.focusedGroupId).toBe(
    "group-3",
  );
  expect(state.paneGroups["group-2"]?.activeTabId).toBe("tab-3");
});

test("a focus notification from an on-screen pane still activates it", () => {
  useNativeViewStore.setState({
    views: { "pane-2": "browser" },
    visibleTerminals: [],
    visibleBrowsers: ["pane-2"],
  });

  syncWorkspaceFocusForNativeNotification("pane-2");

  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("workspace-2");
});

test("a focus notification from an off-screen pane is dropped", () => {
  // A surface echoes back the focus we asked for. If the active tab moved on
  // in between, honouring the echo drags the selection back, which re-focuses
  // the previous pane, whose echo drags it forward again — two panes ping-pong
  // at IPC speed. Only a visible surface can have been clicked by the user.
  useNativeViewStore.setState({
    views: { "pane-2": "browser", "pane-4": "browser" },
    visibleTerminals: [],
    visibleBrowsers: ["pane-4"],
  });

  syncWorkspaceFocusForNativeNotification("pane-2");

  const state = useWorkspaceStore.getState();
  expect(state.activeWorkspaceId).toBe("workspace-1");
  expect(state.paneGroups["group-2"]?.activeTabId).toBe("tab-3");
});

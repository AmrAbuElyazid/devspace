import { beforeEach, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarTreeLevel } from "./Sidebar";
import { SidebarProvider, type SidebarContextValue } from "./Sidebar/SidebarContext";
import { useWorkspaceStore } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";

const noop = () => {};

function createTestContext(overrides: Partial<SidebarContextValue> = {}): SidebarContextValue {
  const state = useWorkspaceStore.getState();
  return {
    editingId: null,
    editingType: null,
    filteredWorkspaceIds: null,
    onStartEditingFolder: noop,
    onStartEditingWorkspace: noop,
    onRenameFolder: noop,
    onRenameWorkspace: noop,
    onStopEditing: noop,
    onContextMenuFolder: noop,
    onContextMenuWorkspace: noop,
    onSelectWorkspace: noop,
    onAddWorkspaceToFolder: noop,
    activeWorkspaceId: "ws-1",
    workspaces: state.workspaces,
    panes: state.panes,
    paneGroups: state.paneGroups,
    toggleFolderCollapsed: noop,
    deleteTarget: null,
    setDeleteTarget: noop,
    ...overrides,
  };
}

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace One",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    activeWorkspaceId: "ws-1",
    panes: {},
    paneGroups: { "group-1": { id: "group-1", tabs: [], activeTabId: "" } },
    pinnedSidebarNodes: [
      { type: "folder", id: "folder-1", name: "Pinned Folder", collapsed: false, children: [] },
      { type: "workspace", workspaceId: "ws-1" },
    ],
    sidebarTree: [],
  });

  useSettingsStore.setState({
    sidebarOpen: true,
    sidebarWidth: 280,
  });
});

test("renders pinned folders and workspaces from pinnedSidebarNodes", () => {
  const state = useWorkspaceStore.getState();
  const html = renderToStaticMarkup(
    <SidebarProvider value={createTestContext()}>
      <SidebarTreeLevel
        nodes={state.pinnedSidebarNodes}
        container="pinned"
        parentFolderId={null}
        depth={0}
      />
    </SidebarProvider>,
  );

  expect(html).toContain("Pinned Folder");
  expect(html).toContain("Workspace One");
});

test("renders expanded folders without crashing", () => {
  const html = renderToStaticMarkup(
    <SidebarProvider value={createTestContext()}>
      <SidebarTreeLevel
        nodes={[
          {
            type: "folder",
            id: "folder-2",
            name: "Expanded Folder",
            collapsed: false,
            children: [],
          },
        ]}
        container="main"
        parentFolderId={null}
        depth={0}
      />
    </SidebarProvider>,
  );

  expect(html).toContain("Expanded Folder");
});

test("renders expanded folders with child workspaces without crashing", () => {
  const html = renderToStaticMarkup(
    <SidebarProvider value={createTestContext()}>
      <SidebarTreeLevel
        nodes={[
          {
            type: "folder",
            id: "folder-3",
            name: "Folder With Workspace",
            collapsed: false,
            children: [{ type: "workspace", workspaceId: "ws-1" }],
          },
        ]}
        container="main"
        parentFolderId={null}
        depth={0}
      />
    </SidebarProvider>,
  );

  expect(html).toContain("Folder With Workspace");
  expect(html).toContain("Workspace One");
});

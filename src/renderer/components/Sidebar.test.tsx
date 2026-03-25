import { beforeEach, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarTreeLevel } from './Sidebar'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [
      {
        id: 'ws-1',
        name: 'Workspace One',
        root: { type: 'leaf', groupId: 'group-1' },
        focusedGroupId: 'group-1',
        lastActiveAt: Date.now(),
      },
    ],
    activeWorkspaceId: 'ws-1',
    panes: {},
    paneGroups: { 'group-1': { id: 'group-1', tabs: [], activeTabId: '' } },
    pinnedSidebarNodes: [
      { type: 'folder', id: 'folder-1', name: 'Pinned Folder', collapsed: false, children: [] },
      { type: 'workspace', workspaceId: 'ws-1' },
    ],
    sidebarTree: [],
  })

  useSettingsStore.setState({
    sidebarOpen: true,
    sidebarWidth: 280,
  })
})

test('renders pinned folders and workspaces from pinnedSidebarNodes', () => {
  const state = useWorkspaceStore.getState()
  const html = renderToStaticMarkup(
    <SidebarTreeLevel
      nodes={state.pinnedSidebarNodes}
      container="pinned"
      parentFolderId={null}
      depth={0}
      editingId={null}
      editingType={null}
      filteredWorkspaceIds={null}
      onStartEditingFolder={() => {}}
      onStartEditingWorkspace={() => {}}
      onRenameFolder={() => {}}
      onRenameWorkspace={() => {}}
      onStopEditing={() => {}}
      onContextMenuFolder={() => {}}
      onContextMenuWorkspace={() => {}}
      onSelectWorkspace={() => {}}
      activeWorkspaceId="ws-1"
      workspaces={state.workspaces}
      panes={state.panes}
      paneGroups={state.paneGroups}
      toggleFolderCollapsed={() => {}}
      deleteTarget={null}
      setDeleteTarget={() => {}}
    />,
  )

  expect(html).toContain('Pinned Folder')
  expect(html).toContain('Workspace One')
})

test('renders expanded folders without crashing', () => {
  const state = useWorkspaceStore.getState()
  const html = renderToStaticMarkup(
    <SidebarTreeLevel
      nodes={[
        {
          type: 'folder',
          id: 'folder-2',
          name: 'Expanded Folder',
          collapsed: false,
          children: [],
        },
      ]}
      container="main"
      parentFolderId={null}
      depth={0}
      editingId={null}
      editingType={null}
      filteredWorkspaceIds={null}
      onStartEditingFolder={() => {}}
      onStartEditingWorkspace={() => {}}
      onRenameFolder={() => {}}
      onRenameWorkspace={() => {}}
      onStopEditing={() => {}}
      onContextMenuFolder={() => {}}
      onContextMenuWorkspace={() => {}}
      onSelectWorkspace={() => {}}
      activeWorkspaceId="ws-1"
      workspaces={state.workspaces}
      panes={state.panes}
      paneGroups={state.paneGroups}
      toggleFolderCollapsed={() => {}}
      deleteTarget={null}
      setDeleteTarget={() => {}}
    />,
  )

  expect(html).toContain('Expanded Folder')
})

test('renders expanded folders with child workspaces without crashing', () => {
  const state = useWorkspaceStore.getState()
  const html = renderToStaticMarkup(
    <SidebarTreeLevel
      nodes={[
        {
          type: 'folder',
          id: 'folder-3',
          name: 'Folder With Workspace',
          collapsed: false,
          children: [{ type: 'workspace', workspaceId: 'ws-1' }],
        },
      ]}
      container="main"
      parentFolderId={null}
      depth={0}
      editingId={null}
      editingType={null}
      filteredWorkspaceIds={null}
      onStartEditingFolder={() => {}}
      onStartEditingWorkspace={() => {}}
      onRenameFolder={() => {}}
      onRenameWorkspace={() => {}}
      onStopEditing={() => {}}
      onContextMenuFolder={() => {}}
      onContextMenuWorkspace={() => {}}
      onSelectWorkspace={() => {}}
      activeWorkspaceId="ws-1"
      workspaces={state.workspaces}
      panes={state.panes}
      paneGroups={state.paneGroups}
      toggleFolderCollapsed={() => {}}
      deleteTarget={null}
      setDeleteTarget={() => {}}
    />,
  )

  expect(html).toContain('Folder With Workspace')
  expect(html).toContain('Workspace One')
})

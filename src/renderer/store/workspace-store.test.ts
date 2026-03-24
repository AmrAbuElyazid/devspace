import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanupPaneResources } from '../lib/pane-cleanup'
import { normalizeFocusedPaneIds, useWorkspaceStore } from './workspace-store'
import type { Workspace } from '../types/workspace'

function resetWorkspaceStore(): void {
  useWorkspaceStore.setState((state) => ({
    ...state,
    workspaces: [],
    activeWorkspaceId: '',
    panes: {},
    sidebarTree: [],
  }))
}

test('cleanupPaneResources destroys browser panes and clears runtime state', () => {
  const destroyedPaneIds: string[] = []
  const clearedPaneIds: string[] = []

  cleanupPaneResources(
    {
      'pane-1': {
        id: 'pane-1',
        type: 'browser',
        title: 'Browser',
        config: { url: 'https://example.com' },
      },
    },
    'pane-1',
    {
      destroyTerminal: () => {
        throw new Error('unexpected terminal cleanup')
      },
      destroyBrowser: (paneId) => {
        destroyedPaneIds.push(paneId)
      },
      destroyEditor: () => {
        throw new Error('unexpected editor cleanup')
      },
      clearBrowserRuntime: (paneId) => {
        clearedPaneIds.push(paneId)
      },
    },
  )

  assert.deepEqual(destroyedPaneIds, ['pane-1'])
  assert.deepEqual(clearedPaneIds, ['pane-1'])
})

test('updateBrowserPaneZoom persists zoom on browser pane config only', () => {
  const initialState = useWorkspaceStore.getState()
  const originalPanes = initialState.panes

  useWorkspaceStore.setState({
    panes: {
      'pane-1': {
        id: 'pane-1',
        type: 'browser',
        title: 'Browser',
        config: { url: 'https://example.com', zoom: 1 },
      },
      'pane-2': {
        id: 'pane-2',
        type: 'terminal',
        title: 'Terminal',
        config: {},
      },
    },
  })

  useWorkspaceStore.getState().updateBrowserPaneZoom('pane-1', 1.25)
  useWorkspaceStore.getState().updateBrowserPaneZoom('pane-2', 2)

  assert.deepEqual(useWorkspaceStore.getState().panes['pane-1']?.config, {
    url: 'https://example.com',
    zoom: 1.25,
  })
  assert.deepEqual(useWorkspaceStore.getState().panes['pane-2']?.config, {})

  useWorkspaceStore.setState({ panes: originalPanes })
})

test('new tabs and replacement tabs initialize focusedPaneId to their first pane', () => {
  resetWorkspaceStore()

  useWorkspaceStore.getState().addWorkspace('Workspace 1')

  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
  const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  assert.ok(workspace)

  const initialTab = workspace?.tabs[0]
  assert.ok(initialTab)
  const initialPaneId = initialTab?.root.type === 'leaf' ? initialTab.root.paneId : null
  assert.equal(initialTab?.focusedPaneId, initialPaneId)

  useWorkspaceStore.getState().addTab(workspaceId, 'Second Tab')

  const updatedWorkspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  const addedTab = updatedWorkspace?.tabs.find((t) => t.name === 'Second Tab')
  assert.ok(addedTab)
  const addedPaneId = addedTab?.root.type === 'leaf' ? addedTab.root.paneId : null
  assert.equal(addedTab?.focusedPaneId, addedPaneId)

  if (!initialTab) {
    throw new Error('expected initial tab')
  }

  useWorkspaceStore.getState().removeTab(workspaceId, initialTab.id)

  const replacementWorkspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  const replacementTab = replacementWorkspace?.tabs[0]
  assert.ok(replacementTab)
  const replacementPaneId = replacementTab?.root.type === 'leaf' ? replacementTab.root.paneId : null
  assert.equal(replacementTab?.focusedPaneId, replacementPaneId)
})

test('legacy persisted tabs hydrate with a first-leaf focused pane id', () => {
  const persistedWorkspace: Workspace = {
    id: 'ws-1',
    name: 'Workspace 1',
    activeTabId: 'tab-1',
    tabs: [
      {
        id: 'tab-1',
        name: 'Tab 1',
        focusedPaneId: null,
        root: {
          type: 'branch',
          direction: 'horizontal',
          sizes: [50, 50],
          children: [
            { type: 'leaf', paneId: 'pane-1' },
            { type: 'leaf', paneId: 'pane-2' },
          ],
        },
      },
    ],
  }

  const [hydratedWorkspace] = normalizeFocusedPaneIds([persistedWorkspace])

  assert.equal(hydratedWorkspace?.tabs[0]?.focusedPaneId, 'pane-1')
})

test('openBrowserTab creates a new tab with a browser pane', () => {
  resetWorkspaceStore()

  useWorkspaceStore.getState().addWorkspace('Workspace 1')

  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
  const before = useWorkspaceStore.getState().workspaces.find((workspace) => workspace.id === workspaceId)
  assert.ok(before)

  useWorkspaceStore.getState().openBrowserTab(workspaceId, 'https://example.com/docs')

  const state = useWorkspaceStore.getState()
  const workspace = state.workspaces.find((nextWorkspace) => nextWorkspace.id === workspaceId)
  assert.ok(workspace)
  assert.equal(workspace.tabs.length, 2)

  const browserTab = workspace.tabs[1]
  assert.ok(browserTab)
  assert.equal(workspace.activeTabId, browserTab.id)
  assert.equal(browserTab.root.type, 'leaf')
  if (browserTab.root.type !== 'leaf') {
    throw new Error('expected browser tab root to be a leaf')
  }

  const browserPane = state.panes[browserTab.root.paneId]
  assert.deepEqual(browserPane, {
    id: browserTab.root.paneId,
    type: 'browser',
    title: 'Browser',
    config: { url: 'https://example.com/docs' },
  })
  assert.equal(browserTab.focusedPaneId, browserTab.root.paneId)
})

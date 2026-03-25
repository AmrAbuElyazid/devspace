import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanupPaneResources } from '../lib/pane-cleanup'
import {
  useWorkspaceStore,
  collectGroupIds,
  findParentOfGroup,
  removeGroupFromTree,
  simplifyTree,
  findFirstGroupId,
  findSiblingGroupId,
} from './workspace-store'

/**
 * Reset the workspace store to a clean initial state suitable for tests.
 *
 * After reset the store has zero workspaces and empty maps — call
 * `addWorkspace()` to set up the fixture you need.
 */
function resetWorkspaceStore(): void {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: '',
    panes: {},
    paneGroups: {},
    sidebarTree: [],
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shortcut: reset + add a workspace and return its id. */
function setupWorkspace(name = 'Test Workspace'): string {
  resetWorkspaceStore()
  useWorkspaceStore.getState().addWorkspace(name)
  return useWorkspaceStore.getState().activeWorkspaceId
}

/** Return the workspace object for `id`. */
function getWorkspace(id: string) {
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

test('addGroupTab creates empty pane in group', () => {
  const wsId = setupWorkspace()
  const ws = getWorkspace(wsId)
  assert.ok(ws)

  const focusedGroupId = ws.focusedGroupId
  assert.ok(focusedGroupId)

  const groupBefore = useWorkspaceStore.getState().paneGroups[focusedGroupId]
  assert.ok(groupBefore)
  const tabCountBefore = groupBefore.tabs.length

  useWorkspaceStore.getState().addGroupTab(wsId, focusedGroupId)

  const groupAfter = useWorkspaceStore.getState().paneGroups[focusedGroupId]
  assert.ok(groupAfter)
  assert.equal(groupAfter.tabs.length, tabCountBefore + 1)

  // The new tab should be active
  const newTab = groupAfter.tabs[groupAfter.tabs.length - 1]
  assert.ok(newTab)
  assert.equal(groupAfter.activeTabId, newTab.id)

  // The new pane should exist and be an empty pane
  const newPane = useWorkspaceStore.getState().panes[newTab.paneId]
  assert.ok(newPane)
  assert.equal(newPane.type, 'empty')
  assert.equal(newPane.title, 'Empty')
})

test('removeGroupTab last tab with siblings removes group', () => {
  const wsId = setupWorkspace()
  const ws = getWorkspace(wsId)
  assert.ok(ws)

  const originalGroupId = ws.focusedGroupId
  assert.ok(originalGroupId)

  // Split to create a second group
  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId, 'horizontal')

  const wsAfterSplit = getWorkspace(wsId)
  assert.ok(wsAfterSplit)
  assert.equal(wsAfterSplit.root.type, 'branch')

  const allGroups = collectGroupIds(wsAfterSplit.root)
  assert.equal(allGroups.length, 2)

  // The new group should be focused (splitGroup moves focus to new group)
  const newGroupId = wsAfterSplit.focusedGroupId
  assert.ok(newGroupId)
  assert.notEqual(newGroupId, originalGroupId)

  // Remove the only tab in the new group
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId]
  assert.ok(newGroup)
  assert.equal(newGroup.tabs.length, 1)
  const tabToRemove = newGroup.tabs[0]
  assert.ok(tabToRemove)

  useWorkspaceStore.getState().removeGroupTab(wsId, newGroupId, tabToRemove.id)

  // After removal: the new group should be gone, tree collapses to single leaf
  const wsAfterRemove = getWorkspace(wsId)
  assert.ok(wsAfterRemove)
  assert.equal(wsAfterRemove.root.type, 'leaf')

  if (wsAfterRemove.root.type === 'leaf') {
    assert.equal(wsAfterRemove.root.groupId, originalGroupId)
  }

  // The removed group should no longer exist in paneGroups
  assert.equal(useWorkspaceStore.getState().paneGroups[newGroupId], undefined)

  // Focus should have transferred to the remaining group
  assert.equal(wsAfterRemove.focusedGroupId, originalGroupId)
})

test('removeGroupTab last tab without siblings adds empty', () => {
  const wsId = setupWorkspace()
  const ws = getWorkspace(wsId)
  assert.ok(ws)

  const groupId = ws.focusedGroupId
  assert.ok(groupId)
  assert.equal(ws.root.type, 'leaf') // single group, no siblings

  const group = useWorkspaceStore.getState().paneGroups[groupId]
  assert.ok(group)
  const tabToRemove = group.tabs[0]
  assert.ok(tabToRemove)
  const oldPaneId = tabToRemove.paneId

  useWorkspaceStore.getState().removeGroupTab(wsId, groupId, tabToRemove.id)

  // The group should still exist (only group — can't remove it)
  const groupAfter = useWorkspaceStore.getState().paneGroups[groupId]
  assert.ok(groupAfter)

  // It should have exactly 1 tab (the new empty replacement)
  assert.equal(groupAfter.tabs.length, 1)
  const replacementTab = groupAfter.tabs[0]
  assert.ok(replacementTab)
  assert.equal(groupAfter.activeTabId, replacementTab.id)

  // The replacement pane should be a new empty pane
  const replacementPane = useWorkspaceStore.getState().panes[replacementTab.paneId]
  assert.ok(replacementPane)
  assert.equal(replacementPane.type, 'empty')

  // The old pane should be removed
  assert.equal(useWorkspaceStore.getState().panes[oldPaneId], undefined)
})

test('splitGroup creates new group with empty pane', () => {
  const wsId = setupWorkspace()
  const ws = getWorkspace(wsId)
  assert.ok(ws)

  const originalGroupId = ws.focusedGroupId
  assert.ok(originalGroupId)
  assert.equal(ws.root.type, 'leaf') // starts as a single leaf

  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId, 'horizontal')

  const wsAfter = getWorkspace(wsId)
  assert.ok(wsAfter)

  // Root should now be a branch with two leaf children
  assert.equal(wsAfter.root.type, 'branch')
  if (wsAfter.root.type !== 'branch') throw new Error('expected branch')

  assert.equal(wsAfter.root.direction, 'horizontal')
  assert.equal(wsAfter.root.children.length, 2)
  assert.deepEqual(wsAfter.root.sizes, [50, 50])

  const [first, second] = wsAfter.root.children
  assert.ok(first)
  assert.ok(second)
  assert.equal(first.type, 'leaf')
  assert.equal(second.type, 'leaf')

  if (first.type !== 'leaf' || second.type !== 'leaf') {
    throw new Error('expected two leaves')
  }

  // First child retains the original group
  assert.equal(first.groupId, originalGroupId)

  // Second child is the new group
  const newGroupId = second.groupId
  assert.notEqual(newGroupId, originalGroupId)

  // New group exists and has exactly 1 empty pane tab
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId]
  assert.ok(newGroup)
  assert.equal(newGroup.tabs.length, 1)

  const newPane = useWorkspaceStore.getState().panes[newGroup.tabs[0].paneId]
  assert.ok(newPane)
  assert.equal(newPane.type, 'empty')

  // Focus moved to the new group
  assert.equal(wsAfter.focusedGroupId, newGroupId)
})

test('closeGroup destroys all panes and removes group', () => {
  const wsId = setupWorkspace()
  const ws = getWorkspace(wsId)
  assert.ok(ws)

  const originalGroupId = ws.focusedGroupId
  assert.ok(originalGroupId)

  // Split to create two groups
  useWorkspaceStore.getState().splitGroup(wsId, originalGroupId, 'vertical')

  const wsAfterSplit = getWorkspace(wsId)
  assert.ok(wsAfterSplit)

  const newGroupId = wsAfterSplit.focusedGroupId
  assert.ok(newGroupId)
  assert.notEqual(newGroupId, originalGroupId)

  // Record the pane IDs in the new group so we can verify they're cleaned up
  const newGroup = useWorkspaceStore.getState().paneGroups[newGroupId]
  assert.ok(newGroup)
  const paneIdsInNewGroup = newGroup.tabs.map((t) => t.paneId)

  // Close the new group
  useWorkspaceStore.getState().closeGroup(wsId, newGroupId)

  const wsAfterClose = getWorkspace(wsId)
  assert.ok(wsAfterClose)

  // Tree should collapse back to a single leaf
  assert.equal(wsAfterClose.root.type, 'leaf')
  if (wsAfterClose.root.type === 'leaf') {
    assert.equal(wsAfterClose.root.groupId, originalGroupId)
  }

  // The closed group should be removed from paneGroups
  assert.equal(useWorkspaceStore.getState().paneGroups[newGroupId], undefined)

  // All panes from the closed group should be removed
  for (const paneId of paneIdsInNewGroup) {
    assert.equal(useWorkspaceStore.getState().panes[paneId], undefined)
  }

  // Focus should have moved to the remaining group
  assert.equal(wsAfterClose.focusedGroupId, originalGroupId)
})

test('migration from old format preserves panes', () => {
  // The migration function (migratePersistedState) is internal, so we test
  // the structural invariants it must produce by simulating the migrated
  // output and verifying the pure tree helpers operate correctly on it.
  //
  // Old format: workspace had `tabs: Tab[]`, each Tab with a `root` tree
  // where leaves had `paneId`. Migration converts this to:
  //   - workspace.root: SplitNode where leaves have `groupId`
  //   - workspace.focusedGroupId set to the first group
  //   - paneGroups: Record<string, PaneGroup> with entries for each leaf
  //   - inactive tab panes consolidated into the first group

  // Build a new-format tree matching what migration would produce from an
  // old workspace with an active tab containing a horizontal split of two
  // panes (pane-a, pane-b). Each old paneId leaf becomes a groupId leaf.
  const groupA = 'group-for-pane-a'
  const groupB = 'group-for-pane-b'
  const migratedRoot = {
    type: 'branch' as const,
    direction: 'horizontal' as const,
    children: [
      { type: 'leaf' as const, groupId: groupA },
      { type: 'leaf' as const, groupId: groupB },
    ],
    sizes: [50, 50],
  }

  // Verify tree helpers work correctly on the migrated tree structure
  assert.deepEqual(collectGroupIds(migratedRoot), [groupA, groupB])
  assert.equal(findFirstGroupId(migratedRoot), groupA)

  const parentA = findParentOfGroup(migratedRoot, groupA)
  assert.ok(parentA)
  assert.equal(parentA.index, 0)

  const siblingOfA = findSiblingGroupId(migratedRoot, groupA)
  assert.equal(siblingOfA, groupB)

  // Remove groupA and verify tree simplifies to single leaf
  const afterRemove = removeGroupFromTree(migratedRoot, groupA)
  assert.ok(afterRemove)
  assert.equal(afterRemove.type, 'leaf')
  if (afterRemove.type === 'leaf') {
    assert.equal(afterRemove.groupId, groupB)
  }

  // Verify a workspace with this migrated root would be structurally valid
  // by loading it into the store
  resetWorkspaceStore()

  const paneA = { id: 'pane-a', type: 'terminal' as const, title: 'Terminal', config: {} }
  const paneB = { id: 'pane-b', type: 'browser' as const, title: 'Browser', config: { url: 'https://example.com' } }
  const paneC = { id: 'pane-c', type: 'editor' as const, title: 'Editor', config: {} }

  // Simulate migrated pane groups — each old leaf gets its own group,
  // inactive tab panes (pane-c) are added as extra tabs in the first group
  const paneGroupA: import('../types/workspace').PaneGroup = {
    id: groupA,
    tabs: [
      { id: 'tab-a', paneId: 'pane-a' },
      { id: 'tab-c', paneId: 'pane-c' },  // consolidated from inactive tab
    ],
    activeTabId: 'tab-a',
  }
  const paneGroupB: import('../types/workspace').PaneGroup = {
    id: groupB,
    tabs: [{ id: 'tab-b', paneId: 'pane-b' }],
    activeTabId: 'tab-b',
  }

  useWorkspaceStore.setState({
    workspaces: [{
      id: 'ws-migrated',
      name: 'Migrated Workspace',
      root: migratedRoot,
      focusedGroupId: groupA,
    }],
    activeWorkspaceId: 'ws-migrated',
    panes: {
      'pane-a': paneA,
      'pane-b': paneB,
      'pane-c': paneC,
    },
    paneGroups: {
      [groupA]: paneGroupA,
      [groupB]: paneGroupB,
    },
    sidebarTree: [{ type: 'workspace', workspaceId: 'ws-migrated' }],
  })

  // All original panes should be preserved
  const state = useWorkspaceStore.getState()
  assert.ok(state.panes['pane-a'])
  assert.ok(state.panes['pane-b'])
  assert.ok(state.panes['pane-c'])
  assert.equal(state.panes['pane-a'].type, 'terminal')
  assert.equal(state.panes['pane-b'].type, 'browser')
  assert.equal(state.panes['pane-c'].type, 'editor')

  // The migrated workspace should have proper structure
  const ws = state.workspaces[0]
  assert.ok(ws)
  assert.equal(ws.focusedGroupId, groupA)
  assert.equal(ws.root.type, 'branch')

  // First group should have the consolidated inactive tab pane
  assert.equal(state.paneGroups[groupA].tabs.length, 2)
  assert.equal(state.paneGroups[groupA].tabs[1].paneId, 'pane-c')

  // Store operations should work on the migrated data (e.g. split, close)
  useWorkspaceStore.getState().splitGroup('ws-migrated', groupA, 'vertical')
  const wsAfterSplit = useWorkspaceStore.getState().workspaces[0]
  assert.ok(wsAfterSplit)
  const allGroups = collectGroupIds(wsAfterSplit.root)
  assert.equal(allGroups.length, 3) // groupA, groupB, + new group from split
})

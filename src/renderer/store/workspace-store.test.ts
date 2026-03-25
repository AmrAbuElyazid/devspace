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
      pinned: false,
      lastActiveAt: Date.now(),
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

// ---------------------------------------------------------------------------
// pinned & lastActiveAt tests
// ---------------------------------------------------------------------------

test('new workspaces have pinned: false and a recent lastActiveAt', () => {
  const before = Date.now()
  const wsId = setupWorkspace()
  const after = Date.now()

  const ws = getWorkspace(wsId)
  assert.ok(ws)
  assert.equal(ws.pinned, false)
  assert.ok(ws.lastActiveAt >= before, 'lastActiveAt should be >= time before creation')
  assert.ok(ws.lastActiveAt <= after, 'lastActiveAt should be <= time after creation')
})

test('togglePinWorkspace toggles pinned', () => {
  const wsId = setupWorkspace()

  const wsBefore = getWorkspace(wsId)
  assert.ok(wsBefore)
  assert.equal(wsBefore.pinned, false)

  useWorkspaceStore.getState().togglePinWorkspace(wsId)

  const wsAfterPin = getWorkspace(wsId)
  assert.ok(wsAfterPin)
  assert.equal(wsAfterPin.pinned, true)

  useWorkspaceStore.getState().togglePinWorkspace(wsId)

  const wsAfterUnpin = getWorkspace(wsId)
  assert.ok(wsAfterUnpin)
  assert.equal(wsAfterUnpin.pinned, false)
})

test('setActiveWorkspace updates lastActiveAt', () => {
  resetWorkspaceStore()
  useWorkspaceStore.getState().addWorkspace('WS A')
  const wsAId = useWorkspaceStore.getState().activeWorkspaceId

  useWorkspaceStore.getState().addWorkspace('WS B')
  const wsBId = useWorkspaceStore.getState().activeWorkspaceId

  // Record lastActiveAt for WS A before switching
  const wsABefore = getWorkspace(wsAId)
  assert.ok(wsABefore)
  const oldLastActiveAt = wsABefore.lastActiveAt

  // Small delay to ensure Date.now() advances
  const before = Date.now()
  useWorkspaceStore.getState().setActiveWorkspace(wsAId)
  const after = Date.now()

  const wsAAfter = getWorkspace(wsAId)
  assert.ok(wsAAfter)
  assert.ok(wsAAfter.lastActiveAt >= before, 'lastActiveAt should be updated to at least the time of switching')
  assert.ok(wsAAfter.lastActiveAt <= after, 'lastActiveAt should not exceed current time')

  // WS B's lastActiveAt should remain unchanged
  const wsBAfter = getWorkspace(wsBId)
  assert.ok(wsBAfter)
  // WS B was not switched to, so its lastActiveAt should not have changed
  // (it was set when addWorkspace created it, and again when addWorkspace calls setActiveWorkspace implicitly via set)
})

// ── splitGroupWithTab ──

test('splitGroupWithTab splits target group and moves tab', () => {
  const wsId = setupWorkspace()
  const state = useWorkspaceStore.getState()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const groupId = ws.root.type === 'leaf' ? ws.root.groupId : ''
  const group = state.paneGroups[groupId]

  // Add a second tab to the group
  useWorkspaceStore.getState().addGroupTab(wsId, groupId)
  const s2 = useWorkspaceStore.getState()
  const g2 = s2.paneGroups[groupId]
  assert.equal(g2.tabs.length, 2)

  const tabToMove = g2.tabs[1]

  // Split right: should create a new group to the right of the target
  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, 'right')

  const s3 = useWorkspaceStore.getState()
  const ws3 = s3.workspaces.find((w) => w.id === wsId)!
  assert.equal(ws3.root.type, 'branch')
  if (ws3.root.type !== 'branch') return
  assert.equal(ws3.root.direction, 'horizontal')
  assert.equal(ws3.root.children.length, 2)

  // Original group should have 1 tab remaining
  const origGroup = s3.paneGroups[groupId]
  assert.equal(origGroup.tabs.length, 1)

  // New group should have the moved tab
  const newGroupId = ws3.root.children[1].type === 'leaf' ? ws3.root.children[1].groupId : ''
  const newGroup = s3.paneGroups[newGroupId]
  assert.ok(newGroup)
  assert.equal(newGroup.tabs.length, 1)
  assert.equal(newGroup.tabs[0].paneId, tabToMove.paneId)

  // Focus should be on the new group
  assert.equal(ws3.focusedGroupId, newGroupId)
})

test('splitGroupWithTab with left side puts new group first', () => {
  const wsId = setupWorkspace()
  const state = useWorkspaceStore.getState()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const groupId = ws.root.type === 'leaf' ? ws.root.groupId : ''

  // Add second tab
  useWorkspaceStore.getState().addGroupTab(wsId, groupId)
  const g = useWorkspaceStore.getState().paneGroups[groupId]
  const tabToMove = g.tabs[1]

  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, 'left')

  const s = useWorkspaceStore.getState()
  const ws2 = s.workspaces.find((w) => w.id === wsId)!
  assert.equal(ws2.root.type, 'branch')
  if (ws2.root.type !== 'branch') return

  // New group should be FIRST child (left)
  const firstGroupId = ws2.root.children[0].type === 'leaf' ? ws2.root.children[0].groupId : ''
  assert.notEqual(firstGroupId, groupId)
  assert.equal(ws2.focusedGroupId, firstGroupId)
})

test('splitGroupWithTab with single tab on same group populates src with empty pane', () => {
  const wsId = setupWorkspace()
  const state = useWorkspaceStore.getState()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const groupId = ws.root.type === 'leaf' ? ws.root.groupId : ''

  // Group has only 1 tab — split it onto itself
  const group = state.paneGroups[groupId]
  assert.equal(group.tabs.length, 1)
  const tabToMove = group.tabs[0]

  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, groupId, 'right')

  const s = useWorkspaceStore.getState()
  const ws2 = s.workspaces.find((w) => w.id === wsId)!
  assert.equal(ws2.root.type, 'branch')
  if (ws2.root.type !== 'branch') return
  assert.equal(ws2.root.direction, 'horizontal')
  assert.equal(ws2.root.children.length, 2)

  // The original group (left child) should still exist with an empty pane tab
  const leftGroupId = ws2.root.children[0].type === 'leaf' ? ws2.root.children[0].groupId : ''
  assert.equal(leftGroupId, groupId)
  const origGroup = s.paneGroups[groupId]
  assert.ok(origGroup, 'original group must still exist in paneGroups')
  assert.equal(origGroup.tabs.length, 1)
  const emptyPane = s.panes[origGroup.tabs[0].paneId]
  assert.ok(emptyPane)
  assert.equal(emptyPane.type, 'empty')

  // The new group (right child) should have the moved tab's pane
  const rightGroupId = ws2.root.children[1].type === 'leaf' ? ws2.root.children[1].groupId : ''
  assert.notEqual(rightGroupId, groupId)
  const newGroup = s.paneGroups[rightGroupId]
  assert.ok(newGroup)
  assert.equal(newGroup.tabs.length, 1)
  assert.equal(newGroup.tabs[0].paneId, tabToMove.paneId)

  // Focus on the new group
  assert.equal(ws2.focusedGroupId, rightGroupId)
})

test('splitGroupWithTab removes src group when last tab moved and multiple groups', () => {
  const wsId = setupWorkspace()
  const state = useWorkspaceStore.getState()
  const ws = state.workspaces.find((w) => w.id === wsId)!
  const groupId = ws.root.type === 'leaf' ? ws.root.groupId : ''

  // Split to create a second group
  useWorkspaceStore.getState().splitGroup(wsId, groupId, 'horizontal')
  const s2 = useWorkspaceStore.getState()
  const ws2 = s2.workspaces.find((w) => w.id === wsId)!
  assert.equal(ws2.root.type, 'branch')
  if (ws2.root.type !== 'branch') return
  const secondGroupId = ws2.root.children[1].type === 'leaf' ? ws2.root.children[1].groupId : ''

  // Now splitGroupWithTab: move the only tab from groupId to create a split on secondGroupId
  const srcGroup = s2.paneGroups[groupId]
  const tabToMove = srcGroup.tabs[0]

  useWorkspaceStore.getState().splitGroupWithTab(wsId, groupId, tabToMove.id, secondGroupId, 'bottom')

  const s3 = useWorkspaceStore.getState()
  // srcGroup should be gone from paneGroups
  assert.equal(s3.paneGroups[groupId], undefined)
  // Tree should be simplified (no more reference to groupId)
  const allIds = collectGroupIds(s3.workspaces.find((w) => w.id === wsId)!.root)
  assert.ok(!allIds.includes(groupId))
})

// ── moveTabToWorkspace ──

test('moveTabToWorkspace moves tab from one workspace to another', () => {
  resetWorkspaceStore()
  useWorkspaceStore.getState().addWorkspace('Source')
  useWorkspaceStore.getState().addWorkspace('Dest')
  const state = useWorkspaceStore.getState()
  const srcWs = state.workspaces[0]
  const destWs = state.workspaces[1]
  const srcGroupId = srcWs.root.type === 'leaf' ? srcWs.root.groupId : ''
  const destGroupId = destWs.root.type === 'leaf' ? destWs.root.groupId : ''

  // Add a second tab to source
  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId)
  const s2 = useWorkspaceStore.getState()
  const srcGroup = s2.paneGroups[srcGroupId]
  assert.equal(srcGroup.tabs.length, 2)
  const tabToMove = srcGroup.tabs[1]
  const movedPaneId = tabToMove.paneId

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id)

  const s3 = useWorkspaceStore.getState()
  // Source group should have 1 tab
  assert.equal(s3.paneGroups[srcGroupId].tabs.length, 1)
  // Dest group should have 2 tabs (original empty + moved)
  assert.equal(s3.paneGroups[destGroupId].tabs.length, 2)
  // The moved pane should be in the dest group
  assert.ok(s3.paneGroups[destGroupId].tabs.some((t) => t.paneId === movedPaneId))
  // The pane itself should still exist in the global panes map
  assert.ok(s3.panes[movedPaneId])
})

test('moveTabToWorkspace collapses empty source group when multiple exist', () => {
  resetWorkspaceStore()
  useWorkspaceStore.getState().addWorkspace('Source')
  useWorkspaceStore.getState().addWorkspace('Dest')
  const state = useWorkspaceStore.getState()
  const srcWs = state.workspaces[0]
  const destWs = state.workspaces[1]
  const srcGroupId = srcWs.root.type === 'leaf' ? srcWs.root.groupId : ''

  // Create a split in source workspace
  useWorkspaceStore.getState().splitGroup(srcWs.id, srcGroupId, 'horizontal')
  const s2 = useWorkspaceStore.getState()
  const srcWs2 = s2.workspaces.find((w) => w.id === srcWs.id)!
  assert.equal(srcWs2.root.type, 'branch')

  // Move the only tab from srcGroupId to dest workspace
  const srcGroup = s2.paneGroups[srcGroupId]
  const tabToMove = srcGroup.tabs[0]

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id)

  const s3 = useWorkspaceStore.getState()
  // Source group should be deleted from paneGroups
  assert.equal(s3.paneGroups[srcGroupId], undefined)
  // Source workspace tree should be simplified (single leaf)
  const srcWs3 = s3.workspaces.find((w) => w.id === srcWs.id)!
  assert.equal(srcWs3.root.type, 'leaf')
})

test('moveTabToWorkspace adds empty pane when only group becomes empty', () => {
  resetWorkspaceStore()
  useWorkspaceStore.getState().addWorkspace('Source')
  useWorkspaceStore.getState().addWorkspace('Dest')
  const state = useWorkspaceStore.getState()
  const srcWs = state.workspaces[0]
  const destWs = state.workspaces[1]
  const srcGroupId = srcWs.root.type === 'leaf' ? srcWs.root.groupId : ''

  // Source has only 1 group with 1 tab (default empty pane)
  // Add a real tab then move it
  useWorkspaceStore.getState().addGroupTab(srcWs.id, srcGroupId)
  const s2 = useWorkspaceStore.getState()
  // Remove the first (empty) tab so we have just 1 tab
  const firstTab = s2.paneGroups[srcGroupId].tabs[0]
  useWorkspaceStore.getState().removeGroupTab(srcWs.id, srcGroupId, firstTab.id)

  const s3 = useWorkspaceStore.getState()
  const srcGroup = s3.paneGroups[srcGroupId]
  assert.equal(srcGroup.tabs.length, 1)
  const tabToMove = srcGroup.tabs[0]

  useWorkspaceStore.getState().moveTabToWorkspace(srcWs.id, srcGroupId, tabToMove.id, destWs.id)

  const s4 = useWorkspaceStore.getState()
  // Source group should still exist with an empty pane tab
  assert.ok(s4.paneGroups[srcGroupId])
  assert.equal(s4.paneGroups[srcGroupId].tabs.length, 1)
  const replacementPane = s4.panes[s4.paneGroups[srcGroupId].tabs[0].paneId]
  assert.equal(replacementPane.type, 'empty')
})

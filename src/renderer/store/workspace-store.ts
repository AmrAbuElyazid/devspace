import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Workspace,
  SidebarNode,
  Pane,
  PaneType,
  PaneConfig,
  SplitNode,
  SplitDirection,
  PaneGroup,
  PaneGroupTab,
} from '../types/workspace'
import {
  findSidebarNode,
  findFolder,
  removeSidebarNode,
  insertSidebarNode,
  isDescendant,
  updateFolderInTree,
  removeFolderPromoteChildren,
  collectWorkspaceIds,
} from '../lib/sidebar-tree'
import { cleanupPaneResources, type PaneCleanupDeps } from '../lib/pane-cleanup'
import type { DropSide } from '../types/dnd'
import { markBrowserPaneDestroyed } from '../lib/browser-pane-session'
import { useBrowserStore } from './browser-store'
import type { BrowserConfig } from '../types/workspace'

// ---------------------------------------------------------------------------
// Tree helper functions (pure)
// ---------------------------------------------------------------------------

export function findParentOfGroup(
  root: SplitNode,
  groupId: string,
): { parent: SplitNode; index: number } | null {
  if (root.type === 'leaf') return null

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    if (child.type === 'leaf' && child.groupId === groupId) {
      return { parent: root, index: i }
    }
    if (child.type === 'branch') {
      const result = findParentOfGroup(child, groupId)
      if (result) return result
    }
  }
  return null
}

export function collectGroupIds(root: SplitNode): string[] {
  if (root.type === 'leaf') return [root.groupId]
  return root.children.flatMap(collectGroupIds)
}

/** Walk children[0] at each branch level to find the top-left leaf group. */
export function getTopLeftGroupId(root: SplitNode): string {
  if (root.type === 'leaf') return root.groupId
  return getTopLeftGroupId(root.children[0])
}

export function simplifyTree(node: SplitNode): SplitNode {
  if (node.type === 'leaf') return node

  const simplified: SplitNode = {
    ...node,
    children: node.children.map(simplifyTree),
  }

  if (simplified.type === 'branch' && simplified.children.length === 1) {
    return simplified.children[0]
  }

  return simplified
}

export function removeGroupFromTree(root: SplitNode, groupId: string): SplitNode | null {
  if (root.type === 'leaf') {
    return root.groupId === groupId ? null : root
  }

  const newChildren: SplitNode[] = []
  const newSizes: number[] = []
  let removedIndex = -1

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    const result = removeGroupFromTree(child, groupId)
    if (result !== null) {
      newChildren.push(result)
      newSizes.push(root.sizes[i])
    } else {
      removedIndex = i
    }
  }

  // Group not found in this subtree — return unchanged
  if (removedIndex === -1) return root

  if (newChildren.length === 0) return null

  // Re-normalize sizes so they sum to 100
  const sizeSum = newSizes.reduce((a, b) => a + b, 0)
  const normalizedSizes = newSizes.map((s) => (s / sizeSum) * 100)

  const branch: SplitNode = {
    type: 'branch',
    direction: root.direction,
    children: newChildren,
    sizes: normalizedSizes,
  }

  return simplifyTree(branch)
}

// Replace a leaf matching `targetGroupId` with `replacement` (immutable).
function replaceLeafInTree(
  node: SplitNode,
  targetGroupId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === 'leaf') {
    return node.groupId === targetGroupId ? replacement : node
  }

  return {
    ...node,
    children: node.children.map((child) =>
      replaceLeafInTree(child, targetGroupId, replacement),
    ),
  }
}

// Returns the first leaf's groupId in a tree.
export function findFirstGroupId(node: SplitNode): string | null {
  if (node.type === 'leaf') return node.groupId
  for (const child of node.children) {
    const gid = findFirstGroupId(child)
    if (gid) return gid
  }
  return null
}

// Finds a sibling groupId for focus transfer when a group is being removed.
export function findSiblingGroupId(root: SplitNode, groupId: string): string | null {
  const parentResult = findParentOfGroup(root, groupId)
  if (!parentResult || parentResult.parent.type !== 'branch') return null

  const siblings = parentResult.parent.children
  // Prefer previous sibling, else next
  const siblingIndex = parentResult.index > 0 ? parentResult.index - 1 : 1
  if (siblingIndex >= 0 && siblingIndex < siblings.length) {
    const sibling = siblings[siblingIndex]
    return sibling.type === 'leaf'
      ? sibling.groupId
      : findFirstGroupId(sibling)
  }
  return null
}

// Navigate to a branch node via a path of child indices and update its sizes.
function updateSizesAtPath(
  node: SplitNode,
  path: number[],
  sizes: number[],
): SplitNode {
  if (path.length === 0) {
    if (node.type === 'branch') {
      return { ...node, sizes }
    }
    return node
  }

  if (node.type === 'leaf') return node

  const [head, ...rest] = path
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === head ? updateSizesAtPath(child, rest, sizes) : child,
    ),
  }
}

// ---------------------------------------------------------------------------
// Default factory helpers
// ---------------------------------------------------------------------------

function createEmptyPane(): Pane {
  return {
    id: nanoid(),
    type: 'empty',
    title: 'Empty',
    config: {},
  }
}

function createPaneGroup(pane: Pane): PaneGroup {
  const tabId = nanoid()
  return {
    id: nanoid(),
    tabs: [{ id: tabId, paneId: pane.id }],
    activeTabId: tabId,
  }
}

function createDefaultWorkspace(name: string, group: PaneGroup): Workspace {
  return {
    id: nanoid(),
    name,
    root: { type: 'leaf', groupId: group.id },
    focusedGroupId: group.id,
    pinned: false,
    lastActiveAt: Date.now(),
  }
}

const defaultPaneCleanupDeps: PaneCleanupDeps = {
  destroyTerminal: (surfaceId) => {
    void window.api.terminal.destroy(surfaceId)
  },
  destroyBrowser: (paneId) => {
    void window.api.browser.destroy(paneId)
    markBrowserPaneDestroyed(paneId)
  },
  destroyEditor: (paneId) => {
    void window.api.editor.stop(paneId)
  },
  clearBrowserRuntime: (paneId) => {
    useBrowserStore.getState().clearRuntimeState(paneId)
  },
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const titleForType: Record<PaneType, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  editor: 'Editor',
  empty: 'Empty',
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string
  panes: Record<string, Pane>
  paneGroups: Record<string, PaneGroup>
  sidebarTree: SidebarNode[]

  // Workspace CRUD
  addWorkspace: (name?: string) => void
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  setActiveWorkspace: (id: string) => void
  togglePinWorkspace: (id: string) => void

  // Sidebar tree actions
  reorderSidebarNode: (nodeId: string, nodeType: 'workspace' | 'folder', targetParentId: string | null, targetIndex: number) => void
  addFolder: (name: string, parentId?: string | null) => string
  removeFolder: (folderId: string) => void
  renameFolder: (folderId: string, name: string) => void
  toggleFolderCollapsed: (folderId: string) => void
  expandFolder: (folderId: string) => void

  // Focus
  setFocusedGroup: (workspaceId: string, groupId: string) => void

  // Group tab CRUD
  addGroupTab: (workspaceId: string, groupId: string) => void
  removeGroupTab: (workspaceId: string, groupId: string, tabId: string) => void
  setActiveGroupTab: (workspaceId: string, groupId: string, tabId: string) => void
  reorderGroupTabs: (workspaceId: string, groupId: string, fromIndex: number, toIndex: number) => void
  moveTabToGroup: (workspaceId: string, srcGroupId: string, tabId: string, destGroupId: string, insertIndex?: number) => void
  splitGroupWithTab: (workspaceId: string, srcGroupId: string, tabId: string, targetGroupId: string, side: DropSide) => void
  moveTabToWorkspace: (srcWorkspaceId: string, srcGroupId: string, tabId: string, destWorkspaceId: string) => void

  // Browser in group
  openBrowserInGroup: (workspaceId: string, groupId: string, url: string) => void

  // Split operations
  splitGroup: (workspaceId: string, groupId: string, direction: SplitDirection) => void
  closeGroup: (workspaceId: string, groupId: string) => void
  updateSplitSizes: (workspaceId: string, nodePath: number[], sizes: number[]) => void

  // Pane operations
  addPane: (type: PaneType, config?: Partial<PaneConfig>) => string
  removePane: (paneId: string) => void
  updatePaneConfig: (paneId: string, updates: Partial<PaneConfig>) => void
  updateBrowserPaneZoom: (paneId: string, zoom: number) => void
  updatePaneTitle: (paneId: string, title: string) => void
  changePaneType: (paneId: string, type: PaneType, config?: PaneConfig) => void
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const PERSIST_KEY = 'devspace-workspaces'
const PERSIST_DEBOUNCE_MS = 500

// Migration: detect old persisted format and convert to new model
function migratePersistedState(persisted: Record<string, unknown>): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes' | 'paneGroups' | 'sidebarTree'> | null {
  const oldWorkspaces = persisted.workspaces as Array<Record<string, unknown>> | undefined
  if (!oldWorkspaces || oldWorkspaces.length === 0) return null

  // Detect old format: workspace has `tabs` array and no `root`
  const firstWs = oldWorkspaces[0]
  if (!firstWs.tabs || firstWs.root) return null // Not old format

  const newPanes: Record<string, Pane> = { ...(persisted.panes as Record<string, Pane> ?? {}) }
  const newPaneGroups: Record<string, PaneGroup> = {}
  const newWorkspaces: Workspace[] = []

  for (const oldWs of oldWorkspaces) {
    const oldTabs = oldWs.tabs as Array<{
      id: string
      name: string
      root: SplitNode
      focusedPaneId: string | null
    }>

    if (!oldTabs || oldTabs.length === 0) continue

    // Find the active tab
    const activeTabId = oldWs.activeTabId as string
    const activeTab = oldTabs.find((t) => t.id === activeTabId) ?? oldTabs[0]

    // Convert the active tab's tree: each leaf { type: 'leaf', paneId } -> { type: 'leaf', groupId }
    // Each leaf pane gets its own PaneGroup
    const firstGroupId: string[] = []

    function convertTree(node: unknown): SplitNode {
      const n = node as Record<string, unknown>
      if (n.type === 'leaf') {
        const paneId = n.paneId as string
        // Ensure the pane exists; create empty fallback if missing
        if (!newPanes[paneId]) {
          newPanes[paneId] = {
            id: paneId,
            type: 'empty',
            title: 'Empty',
            config: {},
          }
        }
        const group = createPaneGroup(newPanes[paneId])
        newPaneGroups[group.id] = group
        firstGroupId.push(group.id)
        return { type: 'leaf', groupId: group.id }
      }

      // Branch node
      return {
        type: 'branch',
        direction: n.direction as SplitDirection,
        children: (n.children as unknown[]).map(convertTree),
        sizes: n.sizes as number[],
      }
    }

    const newRoot = convertTree(activeTab.root)

    // Consolidate inactive tab panes into the first group as additional tabs
    const targetGroupId = firstGroupId[0]
    if (targetGroupId) {
      for (const oldTab of oldTabs) {
        if (oldTab.id === activeTab.id) continue
        // Collect all pane IDs from this inactive tab's tree
        const inactivePaneIds = collectOldPaneIds(oldTab.root)
        for (const paneId of inactivePaneIds) {
          if (!newPanes[paneId]) {
            newPanes[paneId] = {
              id: paneId,
              type: 'empty',
              title: 'Empty',
              config: {},
            }
          }
          const newTabEntry: PaneGroupTab = { id: nanoid(), paneId }
          newPaneGroups[targetGroupId].tabs.push(newTabEntry)
        }
      }
    }

    const ws: Workspace = {
      id: oldWs.id as string,
      name: oldWs.name as string,
      root: newRoot,
      focusedGroupId: firstGroupId[0] ?? null,
      pinned: false,
      lastActiveAt: Date.now(),
    }
    newWorkspaces.push(ws)
  }

  if (newWorkspaces.length === 0) return null

  return {
    workspaces: newWorkspaces,
    activeWorkspaceId: persisted.activeWorkspaceId as string,
    panes: newPanes,
    paneGroups: newPaneGroups,
    sidebarTree: persisted.sidebarTree as SidebarNode[],
  }
}

// Helper to collect paneIds from old-format SplitNode trees (with paneId leaves)
function collectOldPaneIds(node: unknown): string[] {
  const n = node as Record<string, unknown>
  if (n.type === 'leaf') return [n.paneId as string]
  return ((n.children as unknown[]) ?? []).flatMap(collectOldPaneIds)
}

function loadPersistedState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes' | 'paneGroups' | 'sidebarTree'> | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const persisted = JSON.parse(raw)
    // If persisted data has old format (no sidebarTree), ignore it (fresh start)
    if (!persisted.sidebarTree) return null

    // Check if this is the new format (has paneGroups)
    if (persisted.paneGroups) {
      // Fill in missing pinned/lastActiveAt fields for workspaces saved before these fields existed
      const workspaces = (persisted.workspaces as Workspace[]).map((ws) => ({
        ...ws,
        pinned: ws.pinned ?? false,
        lastActiveAt: ws.lastActiveAt ?? Date.now(),
      }))
      return {
        workspaces,
        activeWorkspaceId: persisted.activeWorkspaceId,
        panes: persisted.panes ?? {},
        paneGroups: persisted.paneGroups,
        sidebarTree: persisted.sidebarTree,
      }
    }

    // Try to migrate from old format
    const migrated = migratePersistedState(persisted)
    if (migrated) return migrated

    // Can't migrate, return null for fresh start
    return null
  } catch {
    return null
  }
}

// Build initial state — hydrate from localStorage or create defaults
function buildInitialState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes' | 'paneGroups' | 'sidebarTree'> {
  const persisted = loadPersistedState()
  if (persisted) {
    return persisted
  }
  const pane = createEmptyPane()
  const group = createPaneGroup(pane)
  const ws = createDefaultWorkspace('Workspace 1', group)
  return {
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    panes: { [pane.id]: pane },
    paneGroups: { [group.id]: group },
    sidebarTree: [{ type: 'workspace' as const, workspaceId: ws.id }],
  }
}

export const useWorkspaceStore = create<WorkspaceState>()(
    (set, get) => ({
      ...buildInitialState(),

      // -------------------------------------------------------------------
      // Workspace CRUD
      // -------------------------------------------------------------------

      addWorkspace: (name) => {
        const pane = createEmptyPane()
        const group = createPaneGroup(pane)
        const wsName = name ?? `Workspace ${get().workspaces.length + 1}`
        const ws = createDefaultWorkspace(wsName, group)
        set((state) => ({
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
          panes: { ...state.panes, [pane.id]: pane },
          paneGroups: { ...state.paneGroups, [group.id]: group },
          sidebarTree: [...state.sidebarTree, { type: 'workspace' as const, workspaceId: ws.id }],
        }))
      },

      removeWorkspace: (id) => {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === id)
        if (!ws) return

        // Collect all group IDs and clean up all panes in each group
        const groupIds = collectGroupIds(ws.root)
        const newPanes = { ...state.panes }
        const newPaneGroups = { ...state.paneGroups }

        for (const gid of groupIds) {
          const group = newPaneGroups[gid]
          if (group) {
            for (const tab of group.tabs) {
              cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps)
              delete newPanes[tab.paneId]
            }
            delete newPaneGroups[gid]
          }
        }

        const [newTree] = removeSidebarNode(state.sidebarTree, id, 'workspace')
        const remaining = state.workspaces.filter((w) => w.id !== id)

        if (remaining.length === 0) {
          const newPane = createEmptyPane()
          const newGroup = createPaneGroup(newPane)
          const newWs = createDefaultWorkspace('Workspace 1', newGroup)
          newPanes[newPane.id] = newPane
          newPaneGroups[newGroup.id] = newGroup
          set({
            workspaces: [newWs],
            activeWorkspaceId: newWs.id,
            panes: newPanes,
            paneGroups: newPaneGroups,
            sidebarTree: [...newTree, { type: 'workspace' as const, workspaceId: newWs.id }],
          })
          return
        }

        let newActiveId = state.activeWorkspaceId
        if (newActiveId === id) {
          const oldIndex = state.workspaces.findIndex((w) => w.id === id)
          newActiveId = remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? remaining[0].id
        }

        set({
          workspaces: remaining,
          activeWorkspaceId: newActiveId,
          panes: newPanes,
          paneGroups: newPaneGroups,
          sidebarTree: newTree,
        })
      },

      renameWorkspace(id, name) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === id ? { ...w, name } : w,
          ),
        })
      },

      setActiveWorkspace(id) {
        set({
          activeWorkspaceId: id,
          workspaces: get().workspaces.map((w) =>
            w.id === id ? { ...w, lastActiveAt: Date.now() } : w,
          ),
        })
      },

      togglePinWorkspace(id) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === id ? { ...w, pinned: !w.pinned } : w,
          ),
        })
      },

      // -------------------------------------------------------------------
      // Focus
      // -------------------------------------------------------------------

      setFocusedGroup(workspaceId, groupId) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, focusedGroupId: groupId }
              : w,
          ),
        })
      },

      // -------------------------------------------------------------------
      // Group tab CRUD
      // -------------------------------------------------------------------

      addGroupTab(workspaceId, groupId) {
        const { paneGroups, panes } = get()
        const group = paneGroups[groupId]
        if (!group) return

        const pane = createEmptyPane()
        const newTab: PaneGroupTab = { id: nanoid(), paneId: pane.id }

        set({
          panes: { ...panes, [pane.id]: pane },
          paneGroups: {
            ...paneGroups,
            [groupId]: {
              ...group,
              tabs: [...group.tabs, newTab],
              activeTabId: newTab.id,
            },
          },
        })
      },

      removeGroupTab(workspaceId, groupId, tabId) {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const group = state.paneGroups[groupId]
        if (!group) return

        const tab = group.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Cleanup the pane for this tab
        cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps)
        const newPanes = { ...state.panes }
        delete newPanes[tab.paneId]

        const remainingTabs = group.tabs.filter((t) => t.id !== tabId)

        if (remainingTabs.length === 0) {
          // Last tab in group
          const allGroupIds = collectGroupIds(ws.root)

          if (allGroupIds.length > 1) {
            // Multiple groups exist: remove this group from the tree
            const newRoot = removeGroupFromTree(ws.root, groupId)
            const simplifiedRoot = newRoot ? simplifyTree(newRoot) : null

            if (!simplifiedRoot) {
              // Shouldn't happen if allGroupIds.length > 1, but handle gracefully
              const emptyPane = createEmptyPane()
              newPanes[emptyPane.id] = emptyPane
              const newGroup = createPaneGroup(emptyPane)
              const newPaneGroups = { ...state.paneGroups }
              delete newPaneGroups[groupId]
              newPaneGroups[newGroup.id] = newGroup

              set({
                workspaces: state.workspaces.map((w) =>
                  w.id === workspaceId
                    ? { ...w, root: { type: 'leaf', groupId: newGroup.id }, focusedGroupId: newGroup.id }
                    : w,
                ),
                panes: newPanes,
                paneGroups: newPaneGroups,
              })
              return
            }

            // Transfer focus
            const newFocusedGroupId = ws.focusedGroupId === groupId
              ? findSiblingGroupId(ws.root, groupId) ?? findFirstGroupId(simplifiedRoot)
              : ws.focusedGroupId

            const newPaneGroups = { ...state.paneGroups }
            delete newPaneGroups[groupId]

            set({
              workspaces: state.workspaces.map((w) =>
                w.id === workspaceId
                  ? { ...w, root: simplifiedRoot, focusedGroupId: newFocusedGroupId }
                  : w,
              ),
              panes: newPanes,
              paneGroups: newPaneGroups,
            })
          } else {
            // Only group — replace with empty pane tab
            const emptyPane = createEmptyPane()
            newPanes[emptyPane.id] = emptyPane
            const newTab: PaneGroupTab = { id: nanoid(), paneId: emptyPane.id }

            set({
              panes: newPanes,
              paneGroups: {
                ...state.paneGroups,
                [groupId]: {
                  ...group,
                  tabs: [newTab],
                  activeTabId: newTab.id,
                },
              },
            })
          }
          return
        }

        // Not the last tab — just remove and update activeTabId if needed
        let newActiveTabId = group.activeTabId
        if (group.activeTabId === tabId) {
          const removedIndex = group.tabs.findIndex((t) => t.id === tabId)
          newActiveTabId = remainingTabs[Math.min(removedIndex, remainingTabs.length - 1)]?.id ?? remainingTabs[0].id
        }

        set({
          panes: newPanes,
          paneGroups: {
            ...state.paneGroups,
            [groupId]: {
              ...group,
              tabs: remainingTabs,
              activeTabId: newActiveTabId,
            },
          },
        })
      },

      setActiveGroupTab(workspaceId, groupId, tabId) {
        const { paneGroups } = get()
        const group = paneGroups[groupId]
        if (!group) return

        set({
          paneGroups: {
            ...paneGroups,
            [groupId]: { ...group, activeTabId: tabId },
          },
        })
      },

      reorderGroupTabs(workspaceId, groupId, fromIndex, toIndex) {
        const { paneGroups } = get()
        const group = paneGroups[groupId]
        if (!group) return

        const tabs = [...group.tabs]
        const [moved] = tabs.splice(fromIndex, 1)
        if (!moved) return
        tabs.splice(toIndex, 0, moved)

        set({
          paneGroups: {
            ...paneGroups,
            [groupId]: { ...group, tabs },
          },
        })
      },

      moveTabToGroup(workspaceId, srcGroupId, tabId, destGroupId, insertIndex) {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const srcGroup = state.paneGroups[srcGroupId]
        const destGroup = state.paneGroups[destGroupId]
        if (!srcGroup || !destGroup) return
        if (srcGroupId === destGroupId) return

        const tab = srcGroup.tabs.find((t) => t.id === tabId)
        if (!tab) return

        const remainingSrcTabs = srcGroup.tabs.filter((t) => t.id !== tabId)

        const destTabs = [...destGroup.tabs]
        const idx = insertIndex !== undefined ? Math.min(insertIndex, destTabs.length) : destTabs.length
        destTabs.splice(idx, 0, tab)

        const newPaneGroups = { ...state.paneGroups }
        let newWorkspaces = state.workspaces
        let newPanes = state.panes

        // Update destination group
        newPaneGroups[destGroupId] = {
          ...destGroup,
          tabs: destTabs,
          activeTabId: tab.id,
        }

        if (remainingSrcTabs.length === 0) {
          // Source group is now empty
          const allGroupIds = collectGroupIds(ws.root)

          if (allGroupIds.length > 1) {
            // Remove the empty source group from the tree
            const newRoot = removeGroupFromTree(ws.root, srcGroupId)
            const simplifiedRoot = newRoot ? simplifyTree(newRoot) : ws.root

            const newFocusedGroupId = ws.focusedGroupId === srcGroupId
              ? destGroupId
              : ws.focusedGroupId

            delete newPaneGroups[srcGroupId]

            newWorkspaces = state.workspaces.map((w) =>
              w.id === workspaceId
                ? { ...w, root: simplifiedRoot, focusedGroupId: newFocusedGroupId }
                : w,
            )
          } else {
            // Only group left — add empty pane tab
            const emptyPane = createEmptyPane()
            newPanes = { ...state.panes, [emptyPane.id]: emptyPane }
            const emptyTab: PaneGroupTab = { id: nanoid(), paneId: emptyPane.id }

            newPaneGroups[srcGroupId] = {
              ...srcGroup,
              tabs: [emptyTab],
              activeTabId: emptyTab.id,
            }
          }
        } else {
          // Update source group activeTabId if needed
          let srcActiveTabId = srcGroup.activeTabId
          if (srcGroup.activeTabId === tabId) {
            srcActiveTabId = remainingSrcTabs[0].id
          }

          newPaneGroups[srcGroupId] = {
            ...srcGroup,
            tabs: remainingSrcTabs,
            activeTabId: srcActiveTabId,
          }
        }

        set({
          workspaces: newWorkspaces,
          panes: newPanes,
          paneGroups: newPaneGroups,
        })
      },

      splitGroupWithTab(workspaceId, srcGroupId, tabId, targetGroupId, side) {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const srcGroup = state.paneGroups[srcGroupId]
        if (!srcGroup || !state.paneGroups[targetGroupId]) return

        const tab = srcGroup.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Create new group containing only the moved tab
        const newTabId = nanoid()
        const newGroup: PaneGroup = {
          id: nanoid(),
          tabs: [{ id: newTabId, paneId: tab.paneId }],
          activeTabId: newTabId,
        }

        // Build the split: direction from side, child order from side
        const direction: SplitDirection = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical'
        const newLeaf: SplitNode = { type: 'leaf', groupId: newGroup.id }
        const targetLeaf: SplitNode = { type: 'leaf', groupId: targetGroupId }
        const children: SplitNode[] = (side === 'left' || side === 'top')
          ? [newLeaf, targetLeaf]
          : [targetLeaf, newLeaf]

        const replacement: SplitNode = {
          type: 'branch',
          direction,
          children,
          sizes: [50, 50],
        }

        let newRoot = replaceLeafInTree(ws.root, targetGroupId, replacement)
        const newPaneGroups = { ...state.paneGroups, [newGroup.id]: newGroup }
        let newWorkspaces = state.workspaces
        let newPanes = state.panes

        // Remove tab from source group
        const remainingSrcTabs = srcGroup.tabs.filter((t) => t.id !== tabId)

        if (remainingSrcTabs.length === 0) {
          // Source group is now empty
          if (srcGroupId !== targetGroupId) {
            // Different groups: remove source leaf from the tree entirely
            const cleaned = removeGroupFromTree(newRoot, srcGroupId)
            newRoot = cleaned ? simplifyTree(cleaned) : newRoot
            delete newPaneGroups[srcGroupId]
          } else {
            // Same group: the target leaf was replaced by a branch that still
            // contains a leaf for srcGroupId — populate it with an empty pane
            // so the leaf isn't orphaned.
            const emptyPane = createEmptyPane()
            newPanes = { ...state.panes, [emptyPane.id]: emptyPane }
            const emptyTab: PaneGroupTab = { id: nanoid(), paneId: emptyPane.id }
            newPaneGroups[srcGroupId] = {
              ...srcGroup,
              tabs: [emptyTab],
              activeTabId: emptyTab.id,
            }
          }
        } else {
          // Update source group
          let srcActiveTabId = srcGroup.activeTabId
          if (srcGroup.activeTabId === tabId) {
            srcActiveTabId = remainingSrcTabs[0].id
          }
          newPaneGroups[srcGroupId] = {
            ...srcGroup,
            tabs: remainingSrcTabs,
            activeTabId: srcActiveTabId,
          }
        }

        newWorkspaces = state.workspaces.map((w) =>
          w.id === workspaceId
            ? { ...w, root: newRoot, focusedGroupId: newGroup.id }
            : w,
        )

        set({
          workspaces: newWorkspaces,
          panes: newPanes,
          paneGroups: newPaneGroups,
        })
      },

      moveTabToWorkspace(srcWorkspaceId, srcGroupId, tabId, destWorkspaceId) {
        const state = get()
        const srcWs = state.workspaces.find((w) => w.id === srcWorkspaceId)
        const destWs = state.workspaces.find((w) => w.id === destWorkspaceId)
        if (!srcWs || !destWs || srcWorkspaceId === destWorkspaceId) return

        const srcGroup = state.paneGroups[srcGroupId]
        if (!srcGroup) return

        const tab = srcGroup.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Find destination group
        const destGroupId = destWs.focusedGroupId ?? findFirstGroupId(destWs.root)
        if (!destGroupId) return
        const destGroup = state.paneGroups[destGroupId]
        if (!destGroup) return

        // Add tab to destination group (new PaneGroupTab referencing same paneId)
        const newTab: PaneGroupTab = { id: nanoid(), paneId: tab.paneId }
        const destTabs = [...destGroup.tabs, newTab]

        const newPaneGroups = {
          ...state.paneGroups,
          [destGroupId]: { ...destGroup, tabs: destTabs, activeTabId: newTab.id },
        }

        // Remove tab from source group
        const remainingSrcTabs = srcGroup.tabs.filter((t) => t.id !== tabId)
        let newWorkspaces = state.workspaces
        let newPanes = state.panes

        if (remainingSrcTabs.length === 0) {
          const allGroupIds = collectGroupIds(srcWs.root)

          if (allGroupIds.length > 1) {
            // Remove empty source group from tree
            const newRoot = removeGroupFromTree(srcWs.root, srcGroupId)
            const simplifiedRoot = newRoot ? simplifyTree(newRoot) : srcWs.root

            const newFocusedGroupId = srcWs.focusedGroupId === srcGroupId
              ? findSiblingGroupId(srcWs.root, srcGroupId) ?? findFirstGroupId(simplifiedRoot)
              : srcWs.focusedGroupId

            delete newPaneGroups[srcGroupId]

            newWorkspaces = state.workspaces.map((w) =>
              w.id === srcWorkspaceId
                ? { ...w, root: simplifiedRoot, focusedGroupId: newFocusedGroupId }
                : w,
            )
          } else {
            // Only group — add empty pane tab
            const emptyPane = createEmptyPane()
            newPanes = { ...state.panes, [emptyPane.id]: emptyPane }
            const emptyTab: PaneGroupTab = { id: nanoid(), paneId: emptyPane.id }
            newPaneGroups[srcGroupId] = {
              ...srcGroup,
              tabs: [emptyTab],
              activeTabId: emptyTab.id,
            }
          }
        } else {
          let srcActiveTabId = srcGroup.activeTabId
          if (srcGroup.activeTabId === tabId) {
            srcActiveTabId = remainingSrcTabs[0].id
          }
          newPaneGroups[srcGroupId] = {
            ...srcGroup,
            tabs: remainingSrcTabs,
            activeTabId: srcActiveTabId,
          }
        }

        set({
          workspaces: newWorkspaces,
          panes: newPanes,
          paneGroups: newPaneGroups,
        })
      },

      // -------------------------------------------------------------------
      // Browser in group
      // -------------------------------------------------------------------

      openBrowserInGroup(workspaceId, groupId, url) {
        const state = get()
        const group = state.paneGroups[groupId]
        if (!group) return

        const paneId = get().addPane('browser', { url })
        const newTab: PaneGroupTab = { id: nanoid(), paneId }

        set({
          paneGroups: {
            ...get().paneGroups,
            [groupId]: {
              ...get().paneGroups[groupId],
              tabs: [...get().paneGroups[groupId].tabs, newTab],
              activeTabId: newTab.id,
            },
          },
        })
      },

      // -------------------------------------------------------------------
      // Split operations
      // -------------------------------------------------------------------

      splitGroup(workspaceId, groupId, direction) {
        const { workspaces, panes, paneGroups } = get()
        const ws = workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const newPane = createEmptyPane()
        const newGroup = createPaneGroup(newPane)

        const replacement: SplitNode = {
          type: 'branch',
          direction,
          children: [
            { type: 'leaf', groupId },
            { type: 'leaf', groupId: newGroup.id },
          ],
          sizes: [50, 50],
        }

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  root: replaceLeafInTree(w.root, groupId, replacement),
                  focusedGroupId: newGroup.id,
                }
              : w,
          ),
          panes: { ...panes, [newPane.id]: newPane },
          paneGroups: { ...paneGroups, [newGroup.id]: newGroup },
        })
      },

      closeGroup(workspaceId, groupId) {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const group = state.paneGroups[groupId]
        if (!group) return

        // Cleanup all panes in the group
        const newPanes = { ...state.panes }
        for (const tab of group.tabs) {
          cleanupPaneResources(state.panes, tab.paneId, defaultPaneCleanupDeps)
          delete newPanes[tab.paneId]
        }

        const allGroupIds = collectGroupIds(ws.root)
        const newPaneGroups = { ...state.paneGroups }

        if (allGroupIds.length <= 1) {
          // Last group — create fresh empty group
          const emptyPane = createEmptyPane()
          newPanes[emptyPane.id] = emptyPane
          const freshGroup = createPaneGroup(emptyPane)
          delete newPaneGroups[groupId]
          newPaneGroups[freshGroup.id] = freshGroup

          set({
            workspaces: state.workspaces.map((w) =>
              w.id === workspaceId
                ? { ...w, root: { type: 'leaf', groupId: freshGroup.id }, focusedGroupId: freshGroup.id }
                : w,
            ),
            panes: newPanes,
            paneGroups: newPaneGroups,
          })
          return
        }

        // Multiple groups — remove from tree and transfer focus
        const newFocusedGroupId = ws.focusedGroupId === groupId
          ? findSiblingGroupId(ws.root, groupId) ?? findFirstGroupId(ws.root)
          : ws.focusedGroupId

        const newRoot = removeGroupFromTree(ws.root, groupId)
        const simplifiedRoot = newRoot ? simplifyTree(newRoot) : ws.root

        delete newPaneGroups[groupId]

        set({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, root: simplifiedRoot, focusedGroupId: newFocusedGroupId }
              : w,
          ),
          panes: newPanes,
          paneGroups: newPaneGroups,
        })
      },

      updateSplitSizes(workspaceId, nodePath, sizes) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, root: updateSizesAtPath(w.root, nodePath, sizes) }
              : w,
          ),
        })
      },

      // -------------------------------------------------------------------
      // Pane operations
      // -------------------------------------------------------------------

      addPane(type, config) {
        const pane: Pane = {
          id: nanoid(),
          type,
          title: titleForType[type],
          config: config ?? {},
        }

        set({ panes: { ...get().panes, [pane.id]: pane } })
        return pane.id
      },

      removePane(paneId) {
        const { panes } = get()
        cleanupPaneResources(panes, paneId, defaultPaneCleanupDeps)
        const newPanes = { ...panes }
        delete newPanes[paneId]
        set({ panes: newPanes })
      },

      updatePaneConfig(paneId, updates) {
        const { panes } = get()
        const pane = panes[paneId]
        if (!pane) return

        const nextConfig = { ...pane.config, ...updates }
        const keys = Object.keys(updates) as Array<keyof typeof nextConfig>
        const hasChange = keys.some((key) => pane.config[key] !== nextConfig[key])
        if (!hasChange) return

        set({
          panes: {
            ...panes,
            [paneId]: { ...pane, config: nextConfig },
          },
        })
      },

      updateBrowserPaneZoom(paneId, zoom) {
        const { panes } = get()
        const pane = panes[paneId]
        if (!pane || pane.type !== 'browser') return

        const config = (pane.config ?? {}) as BrowserConfig
        if (config.zoom === zoom) return

        set({
          panes: {
            ...panes,
            [paneId]: {
              ...pane,
              config: { ...config, zoom },
            },
          },
        })
      },

      updatePaneTitle(paneId, title) {
        const { panes } = get()
        const pane = panes[paneId]
        if (!pane) return

        set({
          panes: { ...panes, [paneId]: { ...pane, title } },
        })
      },

      changePaneType(paneId, type, config) {
        const { panes } = get()
        const pane = panes[paneId]
        if (!pane) return

        if (pane.type !== type) {
          cleanupPaneResources(panes, paneId, defaultPaneCleanupDeps)
        }

        set({
          panes: {
            ...panes,
            [paneId]: {
              ...pane,
              type,
              title: titleForType[type],
              config: config ?? {},
            },
          },
        })
      },

      // -------------------------------------------------------------------
      // Sidebar tree actions
      // -------------------------------------------------------------------

      reorderSidebarNode: (nodeId, nodeType, targetParentId, targetIndex) => {
        set((state) => {
          if (nodeType === 'folder' && targetParentId !== null) {
            if (nodeId === targetParentId) return state
            if (isDescendant(state.sidebarTree, nodeId, targetParentId)) return state
          }
          const [treeAfterRemove, removed] = removeSidebarNode(state.sidebarTree, nodeId, nodeType)
          if (!removed) return state
          const newTree = insertSidebarNode(treeAfterRemove, removed, targetParentId, targetIndex)
          return { sidebarTree: newTree }
        })
      },

      addFolder: (name, parentId = null) => {
        const id = nanoid()
        const folderNode: SidebarNode = { type: 'folder', id, name, collapsed: false, children: [] }
        set((state) => ({
          sidebarTree: insertSidebarNode(state.sidebarTree, folderNode, parentId, parentId === null ? state.sidebarTree.length : Infinity),
        }))
        return id
      },

      removeFolder: (folderId) => {
        set((state) => ({
          sidebarTree: removeFolderPromoteChildren(state.sidebarTree, folderId),
        }))
      },

      renameFolder: (folderId, name) => {
        set((state) => ({
          sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { name }),
        }))
      },

      toggleFolderCollapsed: (folderId) => {
        set((state) => {
          const folder = findFolder(state.sidebarTree, folderId)
          if (!folder) return state
          return { sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { collapsed: !folder.collapsed }) }
        })
      },

      expandFolder: (folderId) => {
        set((state) => ({
          sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { collapsed: false }),
        }))
      },
    }),
)

// ---------------------------------------------------------------------------
// Debounced persistence
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistState(state: WorkspaceState): void {
  const data = {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    sidebarTree: state.sidebarTree,
    panes: state.panes,
    paneGroups: state.paneGroups,
  }
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('[Persist] Failed to save state:', e)
  }
}

function debouncedPersist(state: WorkspaceState): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => persistState(state), PERSIST_DEBOUNCE_MS)
}

// Subscribe to store changes
useWorkspaceStore.subscribe((state) => debouncedPersist(state))

// Flush on unload (prevents data loss on window close)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistState(useWorkspaceStore.getState())
    }
  })
}

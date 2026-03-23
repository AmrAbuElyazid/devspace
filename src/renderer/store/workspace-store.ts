import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Workspace,
  SidebarNode,
  Tab,
  Pane,
  PaneType,
  PaneConfig,
  SplitNode,
  SplitDirection,
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

// ---------------------------------------------------------------------------
// Tree helper functions (pure)
// ---------------------------------------------------------------------------

export function findParentOfPane(
  root: SplitNode,
  paneId: string,
): { parent: SplitNode; index: number } | null {
  if (root.type === 'leaf') return null

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    if (child.type === 'leaf' && child.paneId === paneId) {
      return { parent: root, index: i }
    }
    if (child.type === 'branch') {
      const result = findParentOfPane(child, paneId)
      if (result) return result
    }
  }
  return null
}

export function collectPaneIds(root: SplitNode): string[] {
  if (root.type === 'leaf') return [root.paneId]
  return root.children.flatMap(collectPaneIds)
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

export function removePaneFromTree(root: SplitNode, paneId: string): SplitNode | null {
  if (root.type === 'leaf') {
    return root.paneId === paneId ? null : root
  }

  const newChildren: SplitNode[] = []
  const newSizes: number[] = []
  let removedIndex = -1

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    const result = removePaneFromTree(child, paneId)
    if (result !== null) {
      newChildren.push(result)
      newSizes.push(root.sizes[i])
    } else {
      removedIndex = i
    }
  }

  // Pane not found in this subtree — return unchanged
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

// Replace a leaf matching `targetPaneId` with `replacement` (immutable).
function replaceLeafInTree(
  node: SplitNode,
  targetPaneId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === 'leaf') {
    return node.paneId === targetPaneId ? replacement : node
  }

  return {
    ...node,
    children: node.children.map((child) =>
      replaceLeafInTree(child, targetPaneId, replacement),
    ),
  }
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

function createDefaultTab(name: string, pane: Pane): Tab {
  return {
    id: nanoid(),
    name,
    root: { type: 'leaf', paneId: pane.id },
    focusedPaneId: null,
  }
}

function createDefaultWorkspace(name: string, tab: Tab): Workspace {
  return {
    id: nanoid(),
    name,
    tabs: [tab],
    activeTabId: tab.id,
  }
}

// ---------------------------------------------------------------------------
// PTY cleanup helper
// ---------------------------------------------------------------------------

function destroyPtyForPane(panes: Record<string, Pane>, paneId: string): void {
  const pane = panes[paneId]
  if (pane && pane.type === 'terminal' && pane.config?.ptyId) {
    window.api.pty.destroy(pane.config.ptyId as string)
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string
  panes: Record<string, Pane>
  sidebarTree: SidebarNode[]

  // Workspace CRUD
  addWorkspace: (name?: string) => void
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  setActiveWorkspace: (id: string) => void

  // Sidebar tree actions
  reorderSidebarNode: (nodeId: string, nodeType: 'workspace' | 'folder', targetParentId: string | null, targetIndex: number) => void
  addFolder: (name: string, parentId?: string | null) => string
  removeFolder: (folderId: string) => void
  renameFolder: (folderId: string, name: string) => void
  toggleFolderCollapsed: (folderId: string) => void
  expandFolder: (folderId: string) => void

  // Focus
  setFocusedPane: (workspaceId: string, tabId: string, paneId: string) => void

  // Tab CRUD
  addTab: (workspaceId: string, name?: string) => void
  removeTab: (workspaceId: string, tabId: string) => void
  renameTab: (workspaceId: string, tabId: string, name: string) => void
  setActiveTab: (workspaceId: string, tabId: string) => void

  // Tab DnD actions
  reorderTabs: (workspaceId: string, fromIndex: number, toIndex: number) => void
  moveTabToWorkspace: (fromWorkspaceId: string, tabId: string, toWorkspaceId: string, toIndex?: number) => void
  mergeTabIntoSplit: (sourceWorkspaceId: string, sourceTabId: string, targetWorkspaceId: string, targetTabId: string, targetPaneId: string, side: 'left' | 'right' | 'top' | 'bottom') => void

  // Pane operations
  addPane: (type: PaneType, config?: Partial<PaneConfig>) => string
  removePane: (paneId: string) => void
  updatePaneConfig: (paneId: string, updates: Partial<PaneConfig>) => void
  updatePaneTitle: (paneId: string, title: string) => void
  changePaneType: (paneId: string, type: PaneType, config?: PaneConfig) => void

  // Split operations
  splitPane: (
    workspaceId: string,
    tabId: string,
    targetPaneId: string,
    direction: SplitDirection,
    newPaneType?: PaneType,
  ) => void
  closePane: (workspaceId: string, tabId: string, paneId: string) => void
  updateSplitSizes: (
    workspaceId: string,
    tabId: string,
    nodePath: number[],
    sizes: number[],
  ) => void
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const PERSIST_KEY = 'devspace-workspaces'
const PERSIST_DEBOUNCE_MS = 500

function loadPersistedState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes' | 'sidebarTree'> | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const persisted = JSON.parse(raw)
    // If persisted data has old format (no sidebarTree), ignore it (fresh start)
    if (!persisted.sidebarTree) return null
    return {
      workspaces: persisted.workspaces,
      activeWorkspaceId: persisted.activeWorkspaceId,
      panes: persisted.panes ?? {},
      sidebarTree: persisted.sidebarTree,
    }
  } catch {
    return null
  }
}

// Build initial state — hydrate from localStorage or create defaults
function buildInitialState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes' | 'sidebarTree'> {
  const persisted = loadPersistedState()
  if (persisted) {
    return persisted
  }
  const pane = createEmptyPane()
  const tab = createDefaultTab('Tab 1', pane)
  const ws = createDefaultWorkspace('Workspace 1', tab)
  return {
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    panes: { [pane.id]: pane },
    sidebarTree: [{ type: 'workspace' as const, workspaceId: ws.id }],
  }
}

const titleForType: Record<PaneType, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  editor: 'Editor',
  empty: 'Empty',
}

export const useWorkspaceStore = create<WorkspaceState>()(
    (set, get) => ({
      ...buildInitialState(),

      // -------------------------------------------------------------------
      // Workspace CRUD
      // -------------------------------------------------------------------

      addWorkspace: (name) => {
        const pane = createEmptyPane()
        const tab = createDefaultTab('Tab 1', pane)
        const wsName = name ?? `Workspace ${get().workspaces.length + 1}`
        const ws = createDefaultWorkspace(wsName, tab)
        set((state) => ({
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
          panes: { ...state.panes, [pane.id]: pane },
          sidebarTree: [...state.sidebarTree, { type: 'workspace' as const, workspaceId: ws.id }],
        }))
      },

      removeWorkspace: (id) => {
        const state = get()
        const ws = state.workspaces.find((w) => w.id === id)
        if (!ws) return

        const paneIdsToDestroy: string[] = []
        for (const tab of ws.tabs) {
          paneIdsToDestroy.push(...collectPaneIds(tab.root))
        }
        for (const paneId of paneIdsToDestroy) {
          destroyPtyForPane(state.panes, paneId)
        }
        const newPanes = { ...state.panes }
        for (const paneId of paneIdsToDestroy) {
          delete newPanes[paneId]
        }

        const [newTree] = removeSidebarNode(state.sidebarTree, id, 'workspace')
        const remaining = state.workspaces.filter((w) => w.id !== id)

        if (remaining.length === 0) {
          const newPane = createEmptyPane()
          const newTab = createDefaultTab('Tab 1', newPane)
          const newWs = createDefaultWorkspace('Workspace 1', newTab)
          newPanes[newPane.id] = newPane
          set({
            workspaces: [newWs],
            activeWorkspaceId: newWs.id,
            panes: newPanes,
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
        set({ activeWorkspaceId: id })
      },

      // -------------------------------------------------------------------
      // Tab CRUD
      // -------------------------------------------------------------------

      addTab(workspaceId, name) {
        const { workspaces, panes } = get()
        const ws = workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const pane = createEmptyPane()
        const tab = createDefaultTab(
          name ?? `Tab ${ws.tabs.length + 1}`,
          pane,
        )

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, tabs: [...w.tabs, tab], activeTabId: tab.id }
              : w,
          ),
          panes: { ...panes, [pane.id]: pane },
        })
      },

      removeTab(workspaceId, tabId) {
        const { workspaces, panes } = get()
        const ws = workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const tab = ws.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Destroy PTYs and clean up panes
        const paneIdsToRemove = collectPaneIds(tab.root)
        for (const pid of paneIdsToRemove) {
          destroyPtyForPane(panes, pid)
        }
        const newPanes = { ...panes }
        for (const pid of paneIdsToRemove) {
          delete newPanes[pid]
        }

        const remainingTabs = ws.tabs.filter((t) => t.id !== tabId)

        if (remainingTabs.length === 0) {
          // Must always have at least one tab
          const pane = createEmptyPane()
          const newTab = createDefaultTab('Tab 1', pane)
          newPanes[pane.id] = pane

          set({
            workspaces: workspaces.map((w) =>
              w.id === workspaceId
                ? { ...w, tabs: [newTab], activeTabId: newTab.id }
                : w,
            ),
            panes: newPanes,
          })
          return
        }

        let newActiveTabId = ws.activeTabId
        if (ws.activeTabId === tabId) {
          newActiveTabId = remainingTabs[0].id
        }

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, tabs: remainingTabs, activeTabId: newActiveTabId }
              : w,
          ),
          panes: newPanes,
        })
      },

      renameTab(workspaceId, tabId, name) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId ? { ...t, name } : t,
                  ),
                }
              : w,
          ),
        })
      },

      setActiveTab(workspaceId, tabId) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId ? { ...w, activeTabId: tabId } : w,
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
        destroyPtyForPane(panes, paneId)
        const newPanes = { ...panes }
        delete newPanes[paneId]
        set({ panes: newPanes })
      },

      updatePaneConfig(paneId, updates) {
        const { panes } = get()
        const pane = panes[paneId]
        if (!pane) return

        set({
          panes: {
            ...panes,
            [paneId]: { ...pane, config: { ...pane.config, ...updates } },
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

        // Destroy PTY if changing away from terminal
        if (pane.type === 'terminal' && type !== 'terminal') {
          destroyPtyForPane(panes, paneId)
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
      // Split operations
      // -------------------------------------------------------------------

      splitPane(workspaceId, tabId, targetPaneId, direction, newPaneType) {
        const { workspaces, panes } = get()
        const paneType = newPaneType ?? 'empty'

        const newPane: Pane = {
          id: nanoid(),
          type: paneType,
          title: titleForType[paneType],
          config: {},
        }

        const replacement: SplitNode = {
          type: 'branch',
          direction,
          children: [
            { type: 'leaf', paneId: targetPaneId },
            { type: 'leaf', paneId: newPane.id },
          ],
          sizes: [50, 50],
        }

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId
                      ? {
                          ...t,
                          root: replaceLeafInTree(t.root, targetPaneId, replacement),
                        }
                      : t,
                  ),
                }
              : w,
          ),
          panes: { ...panes, [newPane.id]: newPane },
        })
      },

      closePane(workspaceId, tabId, paneId) {
        const { workspaces, panes } = get()
        const ws = workspaces.find((w) => w.id === workspaceId)
        if (!ws) return

        const tab = ws.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Find sibling pane ID before removing (for focus transfer)
        let siblingPaneId: string | null = null
        if (tab.focusedPaneId === paneId) {
          const parentResult = findParentOfPane(tab.root, paneId)
          if (parentResult && parentResult.parent.type === 'branch') {
            const siblings = parentResult.parent.children
            // Prefer previous sibling, else next
            const siblingIndex = parentResult.index > 0 ? parentResult.index - 1 : 1
            if (siblingIndex < siblings.length && siblingIndex >= 0) {
              const sibling = siblings[siblingIndex]
              siblingPaneId = sibling.type === 'leaf'
                ? sibling.paneId
                : collectPaneIds(sibling)[0] || null
            }
          }
        }

        // Destroy PTY before removing pane
        destroyPtyForPane(panes, paneId)

        const newPanes = { ...panes }
        delete newPanes[paneId]

        let newRoot = removePaneFromTree(tab.root, paneId)

        if (newRoot === null) {
          // Last pane removed — replace with a fresh empty pane
          const emptyPane = createEmptyPane()
          newPanes[emptyPane.id] = emptyPane
          newRoot = { type: 'leaf', paneId: emptyPane.id }
          siblingPaneId = emptyPane.id
        }

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId
                      ? {
                          ...t,
                          root: newRoot,
                          focusedPaneId: tab.focusedPaneId === paneId ? siblingPaneId : t.focusedPaneId,
                        }
                      : t,
                  ),
                }
              : w,
          ),
          panes: newPanes,
        })
      },

      updateSplitSizes(workspaceId, tabId, nodePath, sizes) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId
                      ? { ...t, root: updateSizesAtPath(t.root, nodePath, sizes) }
                      : t,
                  ),
                }
              : w,
          ),
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

      // -------------------------------------------------------------------
      // Focus
      // -------------------------------------------------------------------

      setFocusedPane(workspaceId, tabId, paneId) {
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId ? { ...t, focusedPaneId: paneId } : t,
                  ),
                }
              : w,
          ),
        })
      },

      // -------------------------------------------------------------------
      // Tab DnD actions
      // -------------------------------------------------------------------

      reorderTabs: (workspaceId, fromIndex, toIndex) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== workspaceId) return ws
            const tabs = [...ws.tabs]
            const [moved] = tabs.splice(fromIndex, 1)
            if (!moved) return ws
            tabs.splice(toIndex, 0, moved)
            return { ...ws, tabs }
          }),
        }))
      },

      moveTabToWorkspace: (fromWorkspaceId, tabId, toWorkspaceId, toIndex) => {
        set((state) => {
          const fromWs = state.workspaces.find((w) => w.id === fromWorkspaceId)
          const toWs = state.workspaces.find((w) => w.id === toWorkspaceId)
          if (!fromWs || !toWs) return state
          const tab = fromWs.tabs.find((t) => t.id === tabId)
          if (!tab) return state
          if (fromWorkspaceId === toWorkspaceId) return state

          const remainingTabs = fromWs.tabs.filter((t) => t.id !== tabId)
          let sourceTabs = remainingTabs
          let newPanes = state.panes
          if (sourceTabs.length === 0) {
            const emptyPane = createEmptyPane()
            const emptyTab = createDefaultTab('Tab 1', emptyPane)
            sourceTabs = [emptyTab]
            newPanes = { ...newPanes, [emptyPane.id]: emptyPane }
          }

          let sourceActiveTabId = fromWs.activeTabId
          if (sourceActiveTabId === tabId) {
            sourceActiveTabId = sourceTabs[0].id
          }

          const targetTabs = [...toWs.tabs]
          const insertIndex = toIndex !== undefined ? Math.min(toIndex, targetTabs.length) : targetTabs.length
          targetTabs.splice(insertIndex, 0, tab)

          return {
            workspaces: state.workspaces.map((ws) => {
              if (ws.id === fromWorkspaceId) return { ...ws, tabs: sourceTabs, activeTabId: sourceActiveTabId }
              if (ws.id === toWorkspaceId) return { ...ws, tabs: targetTabs, activeTabId: tab.id }
              return ws
            }),
            activeWorkspaceId: toWorkspaceId,
            panes: newPanes,
          }
        })
      },

      mergeTabIntoSplit: (sourceWorkspaceId, sourceTabId, targetWorkspaceId, targetTabId, targetPaneId, side) => {
        set((state) => {
          const sourceWs = state.workspaces.find((w) => w.id === sourceWorkspaceId)
          const targetWs = state.workspaces.find((w) => w.id === targetWorkspaceId)
          if (!sourceWs || !targetWs) return state
          const sourceTab = sourceWs.tabs.find((t) => t.id === sourceTabId)
          const targetTab = targetWs.tabs.find((t) => t.id === targetTabId)
          if (!sourceTab || !targetTab) return state
          if (sourceWorkspaceId === targetWorkspaceId && sourceTabId === targetTabId) return state

          const newContent: SplitNode = sourceTab.root
          const direction: SplitDirection = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical'
          const existingLeaf: SplitNode = { type: 'leaf', paneId: targetPaneId }
          const children: SplitNode[] = (side === 'left' || side === 'top')
            ? [newContent, existingLeaf]
            : [existingLeaf, newContent]
          const replacement: SplitNode = { type: 'branch', direction, children, sizes: [50, 50] }
          const newTargetRoot = replaceLeafInTree(targetTab.root, targetPaneId, replacement)

          const remainingSourceTabs = sourceWs.tabs.filter((t) => t.id !== sourceTabId)
          let sourceTabs = remainingSourceTabs
          let newPanes = state.panes
          if (sourceTabs.length === 0) {
            const emptyPane = createEmptyPane()
            const emptyTab = createDefaultTab('Tab 1', emptyPane)
            sourceTabs = [emptyTab]
            newPanes = { ...newPanes, [emptyPane.id]: emptyPane }
          }
          let sourceActiveTabId = sourceWs.activeTabId
          if (sourceActiveTabId === sourceTabId) {
            sourceActiveTabId = sourceTabs[0].id
          }

          return {
            workspaces: state.workspaces.map((ws) => {
              if (ws.id === sourceWorkspaceId && ws.id === targetWorkspaceId) {
                const tabs = sourceTabs.map((t) =>
                  t.id === targetTabId ? { ...t, root: newTargetRoot } : t
                )
                return { ...ws, tabs, activeTabId: sourceActiveTabId }
              }
              if (ws.id === sourceWorkspaceId) return { ...ws, tabs: sourceTabs, activeTabId: sourceActiveTabId }
              if (ws.id === targetWorkspaceId) {
                return { ...ws, tabs: ws.tabs.map((t) => t.id === targetTabId ? { ...t, root: newTargetRoot } : t) }
              }
              return ws
            }),
            panes: newPanes,
          }
        })
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
    panes: Object.fromEntries(
      Object.entries(state.panes).map(([id, pane]) => {
        if (pane.type === 'terminal') {
          const config = { ...pane.config } as Record<string, unknown>
          delete config.ptyId
          return [id, { ...pane, config }]
        }
        return [id, pane]
      })
    ),
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
window.addEventListener('beforeunload', () => {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistState(useWorkspaceStore.getState())
  }
})

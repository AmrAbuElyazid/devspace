import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Workspace,
  Tab,
  Pane,
  PaneType,
  PaneConfig,
  SplitNode,
  SplitDirection,
} from '../types/workspace'

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
  }
}

function createDefaultWorkspace(
  name: string,
  tab: Tab,
): Workspace {
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

  // Workspace CRUD
  addWorkspace: (name?: string) => void
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  setActiveWorkspace: (id: string) => void

  // Tab CRUD
  addTab: (workspaceId: string, name?: string) => void
  removeTab: (workspaceId: string, tabId: string) => void
  renameTab: (workspaceId: string, tabId: string, name: string) => void
  setActiveTab: (workspaceId: string, tabId: string) => void

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

function loadPersistedState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes'> | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Build initial state — hydrate from localStorage or create defaults
function buildInitialState(): Pick<WorkspaceState, 'workspaces' | 'activeWorkspaceId' | 'panes'> {
  const persisted = loadPersistedState()
  if (persisted && persisted.workspaces && persisted.workspaces.length > 0) {
    return {
      workspaces: persisted.workspaces,
      activeWorkspaceId: persisted.activeWorkspaceId,
      panes: persisted.panes ?? {},
    }
  }

  const pane = createEmptyPane()
  const tab = createDefaultTab('Tab 1', pane)
  const workspace = createDefaultWorkspace('Workspace 1', tab)

  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    panes: { [pane.id]: pane } as Record<string, Pane>,
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

      addWorkspace(name) {
        const { workspaces, panes } = get()
        const pane = createEmptyPane()
        const tab = createDefaultTab('Tab 1', pane)
        const ws = createDefaultWorkspace(
          name ?? `Workspace ${workspaces.length + 1}`,
          tab,
        )

        set({
          workspaces: [...workspaces, ws],
          activeWorkspaceId: ws.id,
          panes: { ...panes, [pane.id]: pane },
        })
      },

      removeWorkspace(id) {
        const { workspaces, activeWorkspaceId, panes } = get()
        const ws = workspaces.find((w) => w.id === id)
        if (!ws) return

        // Collect pane IDs to remove
        const paneIdsToRemove = new Set<string>()
        for (const tab of ws.tabs) {
          for (const pid of collectPaneIds(tab.root)) {
            paneIdsToRemove.add(pid)
          }
        }

        // Destroy PTYs for all terminal panes being removed
        for (const pid of paneIdsToRemove) {
          destroyPtyForPane(panes, pid)
        }

        const newPanes = { ...panes }
        for (const pid of paneIdsToRemove) {
          delete newPanes[pid]
        }

        const remaining = workspaces.filter((w) => w.id !== id)

        if (remaining.length === 0) {
          // Must always have at least one workspace
          const pane = createEmptyPane()
          const tab = createDefaultTab('Tab 1', pane)
          const newWs = createDefaultWorkspace('Workspace 1', tab)
          newPanes[pane.id] = pane

          set({
            workspaces: [newWs],
            activeWorkspaceId: newWs.id,
            panes: newPanes,
          })
          return
        }

        let newActiveId = activeWorkspaceId
        if (activeWorkspaceId === id) {
          newActiveId = remaining[0].id
        }

        set({
          workspaces: remaining,
          activeWorkspaceId: newActiveId,
          panes: newPanes,
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
        }

        set({
          workspaces: workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  tabs: w.tabs.map((t) =>
                    t.id === tabId ? { ...t, root: newRoot } : t,
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

import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { BrowserPermissionRequest, BrowserRuntimeState } from '../../shared/browser'

interface BrowserStoreState {
  runtimeByPaneId: Record<string, BrowserRuntimeState>
  pendingPermissionRequest: BrowserPermissionRequest | null
  upsertRuntimeState: (state: BrowserRuntimeState) => void
  handleRuntimeStateChange: (
    state: BrowserRuntimeState,
    options: {
      persistUrlChange: (paneId: string, url: string) => void
      persistCommittedNavigation: boolean
    },
  ) => void
  clearRuntimeState: (paneId: string) => void
  setPendingPermissionRequest: (request: BrowserPermissionRequest) => void
  clearPendingPermissionRequest: () => void
}

export function createBrowserStore() {
  return createStore<BrowserStoreState>()((set, get) => ({
    runtimeByPaneId: {},
    pendingPermissionRequest: null,
    upsertRuntimeState: (runtimeState) => {
      set((state) => ({
        runtimeByPaneId: {
          ...state.runtimeByPaneId,
          [runtimeState.paneId]: runtimeState,
        },
      }))
    },
    handleRuntimeStateChange: (runtimeState, options) => {
      const previousUrl = get().runtimeByPaneId[runtimeState.paneId]?.url
      set((state) => ({
        runtimeByPaneId: {
          ...state.runtimeByPaneId,
          [runtimeState.paneId]: runtimeState,
        },
      }))
      if (options.persistCommittedNavigation && previousUrl !== runtimeState.url) {
        options.persistUrlChange(runtimeState.paneId, runtimeState.url)
      }
    },
    clearRuntimeState: (paneId) => {
      set((state) => {
        const runtimeByPaneId = { ...state.runtimeByPaneId }
        delete runtimeByPaneId[paneId]
        return { runtimeByPaneId }
      })
    },
    setPendingPermissionRequest: (request) => {
      set({ pendingPermissionRequest: request })
    },
    clearPendingPermissionRequest: () => {
      set({ pendingPermissionRequest: null })
    },
  }))
}

const browserStore = createBrowserStore()

type BrowserStoreHook = {
  <T>(selector: (state: BrowserStoreState) => T): T
  getState: typeof browserStore.getState
  setState: typeof browserStore.setState
  subscribe: typeof browserStore.subscribe
}

export const useBrowserStore = ((selector) => useStore(browserStore, selector)) as BrowserStoreHook

useBrowserStore.getState = browserStore.getState
useBrowserStore.setState = browserStore.setState
useBrowserStore.subscribe = browserStore.subscribe

export type { BrowserStoreState }

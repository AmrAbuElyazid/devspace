import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { BrowserPermissionRequest, BrowserRuntimeState } from '../../shared/browser'

interface BrowserStoreState {
  runtimeByPaneId: Record<string, BrowserRuntimeState>
  createdPaneIds: Record<string, true>
  pendingPermissionRequest: BrowserPermissionRequest | null
  upsertRuntimeState: (state: BrowserRuntimeState) => void
  clearRuntimeState: (paneId: string) => void
  markPaneCreated: (paneId: string) => void
  markPaneDestroyed: (paneId: string) => void
  setPendingPermissionRequest: (request: BrowserPermissionRequest) => void
  clearPendingPermissionRequest: () => void
}

export function createBrowserStore() {
  return createStore<BrowserStoreState>()((set) => ({
    runtimeByPaneId: {},
    createdPaneIds: {},
    pendingPermissionRequest: null,
    upsertRuntimeState: (runtimeState) => {
      set((state) => ({
        runtimeByPaneId: {
          ...state.runtimeByPaneId,
          [runtimeState.paneId]: runtimeState,
        },
      }))
    },
    clearRuntimeState: (paneId) => {
      set((state) => {
        const runtimeByPaneId = { ...state.runtimeByPaneId }
        delete runtimeByPaneId[paneId]
        return { runtimeByPaneId }
      })
    },
    markPaneCreated: (paneId) => {
      set((state) => ({
        createdPaneIds: {
          ...state.createdPaneIds,
          [paneId]: true,
        },
      }))
    },
    markPaneDestroyed: (paneId) => {
      set((state) => {
        const createdPaneIds = { ...state.createdPaneIds }
        delete createdPaneIds[paneId]
        return { createdPaneIds }
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

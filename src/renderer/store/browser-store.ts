import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { BrowserPermissionRequest, BrowserRuntimeState } from "../../shared/browser";

interface BrowserStoreState {
  runtimeByPaneId: Record<string, BrowserRuntimeState>;
  pendingPermissionRequest: BrowserPermissionRequest | null;
  findBarOpenByPaneId: Record<string, boolean>;
  addressBarFocusTokenByPaneId: Record<string, number>;
  findBarFocusTokenByPaneId: Record<string, number>;
  upsertRuntimeState: (state: BrowserRuntimeState) => void;
  handleRuntimeStateChange: (
    state: BrowserRuntimeState,
    options: {
      persistUrlChange: (paneId: string, url: string) => void;
      persistCommittedNavigation: boolean;
      persistZoomChange?: (paneId: string, zoom: number) => void;
    },
  ) => void;
  clearRuntimeState: (paneId: string) => void;
  setPendingPermissionRequest: (request: BrowserPermissionRequest) => string | null;
  clearPendingPermissionRequest: () => void;
  toggleFindBar: (paneId: string) => void;
  openFindBar: (paneId: string) => void;
  closeFindBar: (paneId: string) => void;
  requestAddressBarFocus: (paneId: string) => void;
  requestFindBarFocus: (paneId: string) => void;
}

function nextToken(current: number | undefined): number {
  return (current ?? 0) + 1;
}

export function createBrowserStore() {
  return createStore<BrowserStoreState>()((set, get) => ({
    runtimeByPaneId: {},
    pendingPermissionRequest: null,
    findBarOpenByPaneId: {},
    addressBarFocusTokenByPaneId: {},
    findBarFocusTokenByPaneId: {},
    upsertRuntimeState: (runtimeState) => {
      set((state) => ({
        runtimeByPaneId: {
          ...state.runtimeByPaneId,
          [runtimeState.paneId]: runtimeState,
        },
      }));
    },
    handleRuntimeStateChange: (runtimeState, options) => {
      const previousRuntimeState = get().runtimeByPaneId[runtimeState.paneId];
      const previousUrl = previousRuntimeState?.url;
      const previousZoom = previousRuntimeState?.currentZoom;
      set((state) => ({
        runtimeByPaneId: {
          ...state.runtimeByPaneId,
          [runtimeState.paneId]: runtimeState,
        },
      }));
      if (options.persistCommittedNavigation && previousUrl !== runtimeState.url) {
        options.persistUrlChange(runtimeState.paneId, runtimeState.url);
      }
      if (
        options.persistZoomChange &&
        previousRuntimeState &&
        previousZoom !== runtimeState.currentZoom
      ) {
        options.persistZoomChange(runtimeState.paneId, runtimeState.currentZoom);
      }
    },
    clearRuntimeState: (paneId) => {
      set((state) => {
        const runtimeByPaneId = { ...state.runtimeByPaneId };
        const findBarOpenByPaneId = { ...state.findBarOpenByPaneId };
        const addressBarFocusTokenByPaneId = { ...state.addressBarFocusTokenByPaneId };
        const findBarFocusTokenByPaneId = { ...state.findBarFocusTokenByPaneId };
        const pendingPermissionRequest =
          state.pendingPermissionRequest?.paneId === paneId ? null : state.pendingPermissionRequest;
        delete runtimeByPaneId[paneId];
        delete findBarOpenByPaneId[paneId];
        delete addressBarFocusTokenByPaneId[paneId];
        delete findBarFocusTokenByPaneId[paneId];
        return {
          runtimeByPaneId,
          pendingPermissionRequest,
          findBarOpenByPaneId,
          addressBarFocusTokenByPaneId,
          findBarFocusTokenByPaneId,
        };
      });
    },
    setPendingPermissionRequest: (request) => {
      const previousRequestToken = get().pendingPermissionRequest?.requestToken ?? null;
      set({ pendingPermissionRequest: request });
      return previousRequestToken;
    },
    clearPendingPermissionRequest: () => {
      set({ pendingPermissionRequest: null });
    },
    toggleFindBar: (paneId) => {
      set((state) => {
        const isOpen = state.findBarOpenByPaneId[paneId] ?? false;
        if (isOpen) {
          return {
            findBarOpenByPaneId: {
              ...state.findBarOpenByPaneId,
              [paneId]: false,
            },
          };
        }

        return {
          findBarOpenByPaneId: {
            ...state.findBarOpenByPaneId,
            [paneId]: true,
          },
          findBarFocusTokenByPaneId: {
            ...state.findBarFocusTokenByPaneId,
            [paneId]: nextToken(state.findBarFocusTokenByPaneId[paneId]),
          },
        };
      });
    },
    openFindBar: (paneId) => {
      set((state) => ({
        findBarOpenByPaneId: {
          ...state.findBarOpenByPaneId,
          [paneId]: true,
        },
        findBarFocusTokenByPaneId: {
          ...state.findBarFocusTokenByPaneId,
          [paneId]: nextToken(state.findBarFocusTokenByPaneId[paneId]),
        },
      }));
    },
    closeFindBar: (paneId) => {
      set((state) => ({
        findBarOpenByPaneId: {
          ...state.findBarOpenByPaneId,
          [paneId]: false,
        },
      }));
    },
    requestAddressBarFocus: (paneId) => {
      set((state) => ({
        addressBarFocusTokenByPaneId: {
          ...state.addressBarFocusTokenByPaneId,
          [paneId]: nextToken(state.addressBarFocusTokenByPaneId[paneId]),
        },
      }));
    },
    requestFindBarFocus: (paneId) => {
      set((state) => ({
        findBarOpenByPaneId: {
          ...state.findBarOpenByPaneId,
          [paneId]: true,
        },
        findBarFocusTokenByPaneId: {
          ...state.findBarFocusTokenByPaneId,
          [paneId]: nextToken(state.findBarFocusTokenByPaneId[paneId]),
        },
      }));
    },
  }));
}

const browserStore = createBrowserStore();

type BrowserStoreHook = {
  <T>(selector: (state: BrowserStoreState) => T): T;
  getState: typeof browserStore.getState;
  setState: typeof browserStore.setState;
  subscribe: typeof browserStore.subscribe;
};

export const useBrowserStore = ((selector) => useStore(browserStore, selector)) as BrowserStoreHook;

useBrowserStore.getState = browserStore.getState;
useBrowserStore.setState = browserStore.setState;
useBrowserStore.subscribe = browserStore.subscribe;

import { create } from "zustand";

/** Search match state reported by Ghostty for a terminal surface. */
interface TerminalSearchState {
  /** Total matches found. -1 means unknown/searching. */
  total: number;
  /** 1-indexed selected match. -1 means none selected. */
  selected: number;
}

function nextToken(current: number | undefined): number {
  return (current ?? 0) + 1;
}

interface TerminalStoreState {
  /** Whether the find bar is open for each pane. */
  findBarOpenByPaneId: Record<string, boolean>;
  /** Monotonically increasing token — bump to trigger focus on the find bar input. */
  findBarFocusTokenByPaneId: Record<string, number>;
  /** Live search match state from Ghostty, keyed by surfaceId. */
  searchStateByPaneId: Record<string, TerminalSearchState>;

  openFindBar: (paneId: string) => void;
  closeFindBar: (paneId: string) => void;
  requestFindBarFocus: (paneId: string) => void;
  updateSearchTotal: (paneId: string, total: number) => void;
  updateSearchSelected: (paneId: string, selected: number) => void;
  clearSearchState: (paneId: string) => void;
}

export const useTerminalStore = create<TerminalStoreState>((set) => ({
  findBarOpenByPaneId: {},
  findBarFocusTokenByPaneId: {},
  searchStateByPaneId: {},

  openFindBar: (paneId) => {
    set((state) => ({
      findBarOpenByPaneId: { ...state.findBarOpenByPaneId, [paneId]: true },
      findBarFocusTokenByPaneId: {
        ...state.findBarFocusTokenByPaneId,
        [paneId]: nextToken(state.findBarFocusTokenByPaneId[paneId]),
      },
    }));
  },

  closeFindBar: (paneId) => {
    set((state) => ({
      findBarOpenByPaneId: { ...state.findBarOpenByPaneId, [paneId]: false },
    }));
  },

  requestFindBarFocus: (paneId) => {
    set((state) => ({
      findBarOpenByPaneId: { ...state.findBarOpenByPaneId, [paneId]: true },
      findBarFocusTokenByPaneId: {
        ...state.findBarFocusTokenByPaneId,
        [paneId]: nextToken(state.findBarFocusTokenByPaneId[paneId]),
      },
    }));
  },

  updateSearchTotal: (paneId, total) => {
    set((state) => {
      const current = state.searchStateByPaneId[paneId];
      return {
        searchStateByPaneId: {
          ...state.searchStateByPaneId,
          [paneId]: { total, selected: current?.selected ?? -1 },
        },
      };
    });
  },

  updateSearchSelected: (paneId, selected) => {
    set((state) => {
      const current = state.searchStateByPaneId[paneId];
      return {
        searchStateByPaneId: {
          ...state.searchStateByPaneId,
          [paneId]: { total: current?.total ?? 0, selected },
        },
      };
    });
  },

  clearSearchState: (paneId) => {
    set((state) => {
      const next = { ...state.searchStateByPaneId };
      delete next[paneId];
      return { searchStateByPaneId: next };
    });
  },
}));

import { create } from "zustand";

/**
 * Per-pane note chrome that has to be reachable from outside the pane.
 *
 * Mirrors the shape `terminal-store` uses for its find bar so that ⌘F can be
 * routed to whichever pane type is focused from one place in
 * `app-shortcut-actions.ts`. The outline flag lives here too so a pane
 * remembers the panel across tab switches, which remount the pane.
 */
function nextToken(current: number | undefined): number {
  return (current ?? 0) + 1;
}

interface NoteStoreState {
  findBarOpenByPaneId: Record<string, boolean>;
  /** Monotonically increasing token — bump to refocus the find input. */
  findBarFocusTokenByPaneId: Record<string, number>;
  outlineOpenByPaneId: Record<string, boolean>;

  closeFindBar: (paneId: string) => void;
  requestFindBarFocus: (paneId: string) => void;
  toggleOutline: (paneId: string) => void;
  clearPaneState: (paneId: string) => void;
}

export const useNoteStore = create<NoteStoreState>((set) => ({
  findBarOpenByPaneId: {},
  findBarFocusTokenByPaneId: {},
  outlineOpenByPaneId: {},

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

  toggleOutline: (paneId) => {
    set((state) => ({
      outlineOpenByPaneId: {
        ...state.outlineOpenByPaneId,
        [paneId]: !state.outlineOpenByPaneId[paneId],
      },
    }));
  },

  clearPaneState: (paneId) => {
    set((state) => {
      if (
        !(paneId in state.findBarOpenByPaneId) &&
        !(paneId in state.findBarFocusTokenByPaneId) &&
        !(paneId in state.outlineOpenByPaneId)
      ) {
        return state;
      }

      const findBarOpenByPaneId = { ...state.findBarOpenByPaneId };
      const findBarFocusTokenByPaneId = { ...state.findBarFocusTokenByPaneId };
      const outlineOpenByPaneId = { ...state.outlineOpenByPaneId };

      delete findBarOpenByPaneId[paneId];
      delete findBarFocusTokenByPaneId[paneId];
      delete outlineOpenByPaneId[paneId];

      return { findBarOpenByPaneId, findBarFocusTokenByPaneId, outlineOpenByPaneId };
    });
  },
}));

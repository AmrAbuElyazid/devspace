import { useEffect } from "react";

import { useNativeViewStore } from "../store/native-view-store";

/**
 * Hide one pane's native view for as long as a renderer popup is open over it.
 *
 * Terminals and browsers are OS-level views composited above the web contents,
 * so a menu or select that opens down into a pane's content area is not merely
 * clipped — it is painted underneath and never appears at all. Tooltips dodge
 * this by opening upward into the chrome, but a menu is far too tall for the
 * 36px of toolbar above it.
 *
 * So the pane's view steps aside for the duration. This is deliberately the
 * per-pane hook rather than the app-wide `pushOverlay`, which blanks every
 * terminal and browser in the workspace — far too much for a dropdown.
 */
export function useNativeViewSuppression(paneId: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const store = useNativeViewStore.getState();
    store.setTemporarilyHiddenPaneId(paneId);

    return () => {
      // Only clear if we are still the pane holding the slot: another pane may
      // have claimed it while this popup was open, and stomping that would
      // leave its view visible underneath its own menu.
      const current = useNativeViewStore.getState();
      if (current.temporarilyHiddenPaneId === paneId) {
        current.setTemporarilyHiddenPaneId(null);
      }
    };
  }, [active, paneId]);
}

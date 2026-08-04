import { useEffect } from "react";
import { useNativeViewStore } from "../store/native-view-store";
import { getActiveDrag } from "./useDndOrchestrator";

/**
 * Terminals are native `NSView`s and browser/editor panes are
 * `WebContentsView`s; both sit above the renderer and swallow every mouse event
 * inside their bounds. A drag whose pointer crosses one simply stops receiving
 * events, and a release over one never reaches dnd-kit at all.
 *
 * `App` already hides the native views for the duration of a drag, but it does
 * so reactively — the effect runs after `onDragStart`, which itself waits for
 * dnd-kit's 6px activation distance, and the hide is a fire-and-forget IPC send.
 * Everything the pointer does in that window is lost if it is over a pane.
 *
 * This shield moves the *start* of the suppression earlier: the views go away on
 * the first pointer movement after a drag handle is pressed, while the cursor is
 * still inside the 30px tab bar. `App`'s effect then keeps them hidden for the
 * rest of the drag and restores them on drop.
 */

/**
 * Sortable ids whose drags can land on a pane, so they need the views out of
 * the way. Folder drags stay inside the sidebar and are left alone.
 */
const SHIELDED_SORTABLE_PREFIXES = ["gtab-", "ws-"];

function hideNativeViews(): void {
  useNativeViewStore.getState().setDragHidesViews(true);
}

function restoreNativeViewsIfIdle(): void {
  // A dnd-kit drag is under way, so it owns the suppression now and App's
  // effect will lift it on drop. Restoring here would flash the views back in
  // mid-drag — and put them right back under the cursor.
  if (getActiveDrag()) return;
  useNativeViewStore.getState().setDragHidesViews(false);
}

function isShieldedDragHandle(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const sortableId = target.closest("[data-sortable-id]")?.getAttribute("data-sortable-id");
  if (!sortableId) return false;

  return SHIELDED_SORTABLE_PREFIXES.some((prefix) => sortableId.startsWith(prefix));
}

/** Mount once, at the app root. */
export function useNativeViewDragShield(): void {
  useEffect(() => {
    let armed = false;
    let hidden = false;

    const onPointerDown = (event: PointerEvent) => {
      hidden = false;
      armed = event.isPrimary !== false && event.button === 0 && isShieldedDragHandle(event.target);
    };

    const onPointerMove = () => {
      if (!armed || hidden) return;
      // Deliberately the first *move* rather than the pointerdown: a plain
      // click to switch tabs never moves, so it never hides anything and never
      // flashes. One pixel is enough to get the IPC in flight well before the
      // cursor can reach a pane.
      hidden = true;
      hideNativeViews();
    };

    const onPointerRelease = () => {
      if (!armed) return;
      armed = false;
      if (!hidden) return;
      hidden = false;
      restoreNativeViewsIfIdle();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerRelease, true);
    document.addEventListener("pointercancel", onPointerRelease, true);
    window.addEventListener("blur", onPointerRelease);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerRelease, true);
      document.removeEventListener("pointercancel", onPointerRelease, true);
      window.removeEventListener("blur", onPointerRelease);
    };
  }, []);
}

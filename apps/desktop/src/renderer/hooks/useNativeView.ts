import { useEffect, type RefObject } from "react";
import {
  useNativeViewStore,
  setNativeViewElement,
  updateNativeViewBounds,
  clearNativeViewBounds,
  type NativeViewType,
} from "../store/native-view-store";

interface UseNativeViewOptions {
  /** Unique pane ID. */
  id: string;
  /** 'terminal' for Ghostty surfaces, 'browser' for WebContentsViews (incl. editor / t3code). */
  type: NativeViewType;
  /** Ref to the DOM placeholder element whose bounds we sync. */
  ref: RefObject<HTMLElement | null>;
  /**
   * When false the view is not registered with the manager.
   * Use this for panes that haven't created their native view yet
   * (e.g. EditorPane in 'starting' state) or that are in a failure
   * state (BrowserPane with a navigation error).
   */
  enabled?: boolean;
}

interface UseNativeViewReturn {
  /** Whether the native view is currently being shown by the manager. */
  isVisible: boolean;
}

/**
 * Unified hook for native view lifecycle management.
 *
 * Replaces the per-pane show/hide effects and the separate
 * `useTerminalBounds` / `useBrowserBounds` hooks.
 *
 * - Registers / unregisters the view with the centralized NativeViewManager store.
 * - Registers the placeholder element so the manager can measure and observe
 *   only the currently-visible native views.
 * - Returns the current visibility state so the pane component can react
 *   (e.g. auto-focus a terminal, set `data-native-view-hidden`).
 */
export function useNativeView({
  id,
  type,
  ref,
  enabled = true,
}: UseNativeViewOptions): UseNativeViewReturn {
  const register = useNativeViewStore((s) => s.register);
  const unregister = useNativeViewStore((s) => s.unregister);

  const isVisible = useNativeViewStore((s) => {
    if (!enabled) return false;
    return type === "terminal" ? s.visibleTerminals.includes(id) : s.visibleBrowsers.includes(id);
  });

  // ── Registration ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    setNativeViewElement(id, el);

    // Eagerly populate the bounds cache from the placeholder's current
    // layout BEFORE calling register().  register() synchronously calls
    // reconcile(), which reads from the cache to send bounds to the main
    // process before making the view visible.  Without this, a freshly-
    // mounted view (new tab) or a remounted view (split restructure,
    // where unregister cleared the cache) would be shown with missing or
    // zero bounds, causing a black/mis-sized frame.
    if (el) {
      const rect = el.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      if (width > 0 && height > 0) {
        updateNativeViewBounds(id, {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width,
          height,
        });
      }
    }

    register(id, type);
    return () => {
      unregister(id);
      setNativeViewElement(id, null);
      clearNativeViewBounds(id);
    };
  }, [id, type, enabled, ref, register, unregister]);

  return { isVisible };
}

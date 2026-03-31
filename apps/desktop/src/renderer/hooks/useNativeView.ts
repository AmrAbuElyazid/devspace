import { useEffect, type RefObject } from "react";
import {
  useNativeViewStore,
  updateNativeViewBounds,
  clearNativeViewBounds,
  type NativeViewType,
} from "../store/native-view-store";

interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

function boundsEqual(a: ViewBounds | null, b: ViewBounds): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Unified hook for native view lifecycle management.
 *
 * Replaces the per-pane show/hide effects and the separate
 * `useTerminalBounds` / `useBrowserBounds` hooks.
 *
 * - Registers / unregisters the view with the centralized NativeViewManager store.
 * - Syncs the placeholder element's bounds to the main process via ResizeObserver.
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

    // Eagerly populate the bounds cache from the placeholder's current
    // layout BEFORE calling register().  register() synchronously calls
    // reconcile(), which reads from the cache to send bounds to the main
    // process before making the view visible.  Without this, a freshly-
    // mounted view (new tab) or a remounted view (split restructure,
    // where unregister cleared the cache) would be shown with missing or
    // zero bounds, causing a black/mis-sized frame.
    const el = ref.current;
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
    };
  }, [id, type, enabled, ref, register, unregister]);

  // ── Bounds syncing ──────────────────────────────────────────────────
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    let frameId: number | null = null;
    let lastBounds: ViewBounds | null = null;

    const syncBounds = (): void => {
      frameId = null;
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const next: ViewBounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      };

      if (boundsEqual(lastBounds, next)) return;
      lastBounds = next;
      updateNativeViewBounds(id, next);
    };

    const scheduleSync = (): void => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(syncBounds);
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(element);

    // Initial sync + resize / scroll listeners
    scheduleSync();
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      clearNativeViewBounds(id);
    };
  }, [id, enabled, ref]);

  return { isVisible };
}

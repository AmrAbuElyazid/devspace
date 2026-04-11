import { create } from "zustand";
import { useWorkspaceStore } from "./workspace-store";
import { useSettingsStore } from "./settings-store";
import { collectGroupIds } from "../lib/split-tree";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NativeViewType = "terminal" | "browser";

interface NativeViewProfilingSnapshot {
  registered: { total: number; terminals: number; browsers: number };
  visible: { total: number; terminals: number; browsers: number };
  hiddenByOverlay: boolean;
  hiddenByDrag: boolean;
  counters: {
    registerCalls: number;
    unregisterCalls: number;
    reconcileCalls: number;
    visibleBoundsSyncPasses: number;
    boundsSyncCalls: number;
    focusRequests: number;
    terminalFocusRequests: number;
    browserFocusRequests: number;
  };
}

interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boundsEqual(a: ViewBounds | null | undefined, b: ViewBounds): boolean {
  return (
    a !== null &&
    a !== undefined &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

interface NativeViewState {
  /** Registered native views: paneId → view type. */
  views: Record<string, NativeViewType>;
  /** Terminal IDs that the main process currently considers visible. */
  visibleTerminals: string[];
  /** Browser IDs (incl. editor/t3code) that the main process currently considers visible. */
  visibleBrowsers: string[];
  /** When true, all native views are hidden (e.g. during a group-tab drag). */
  dragHidesViews: boolean;

  register: (id: string, type: NativeViewType) => void;
  unregister: (id: string) => void;
  setDragHidesViews: (active: boolean) => void;
  reconcile: () => void;
}

// ---------------------------------------------------------------------------
// Module-level bounds cache (not reactive — avoids re-renders on resize)
// ---------------------------------------------------------------------------

const boundsCache = new Map<string, ViewBounds>();
const elementCache = new Map<string, HTMLElement>();
const observedElements = new Map<string, HTMLElement>();

let visibleLayoutObserver: ResizeObserver | null = null;
let resizeListenerAttached = false;
let visibleBoundsFrameId: number | null = null;

const nativeViewProfilingCounters: NativeViewProfilingSnapshot["counters"] = {
  registerCalls: 0,
  unregisterCalls: 0,
  reconcileCalls: 0,
  visibleBoundsSyncPasses: 0,
  boundsSyncCalls: 0,
  focusRequests: 0,
  terminalFocusRequests: 0,
  browserFocusRequests: 0,
};

function getRegisteredCounts(views: Record<string, NativeViewType>) {
  let terminals = 0;
  let browsers = 0;
  for (const viewType of Object.values(views)) {
    if (viewType === "terminal") {
      terminals++;
    } else {
      browsers++;
    }
  }

  return { terminals, browsers, total: terminals + browsers };
}

function recordBoundsSync(): void {
  nativeViewProfilingCounters.boundsSyncCalls++;
}

export function recordNativeFocusRequest(type: NativeViewType): void {
  nativeViewProfilingCounters.focusRequests++;
  if (type === "terminal") {
    nativeViewProfilingCounters.terminalFocusRequests++;
    return;
  }

  nativeViewProfilingCounters.browserFocusRequests++;
}

export function resetNativeViewProfilingCounters(): void {
  nativeViewProfilingCounters.registerCalls = 0;
  nativeViewProfilingCounters.unregisterCalls = 0;
  nativeViewProfilingCounters.reconcileCalls = 0;
  nativeViewProfilingCounters.visibleBoundsSyncPasses = 0;
  nativeViewProfilingCounters.boundsSyncCalls = 0;
  nativeViewProfilingCounters.focusRequests = 0;
  nativeViewProfilingCounters.terminalFocusRequests = 0;
  nativeViewProfilingCounters.browserFocusRequests = 0;
}

export function getNativeViewProfilingSnapshot(): NativeViewProfilingSnapshot {
  const state = useNativeViewStore.getState();
  return {
    registered: getRegisteredCounts(state.views),
    visible: {
      terminals: state.visibleTerminals.length,
      browsers: state.visibleBrowsers.length,
      total: state.visibleTerminals.length + state.visibleBrowsers.length,
    },
    hiddenByOverlay: useSettingsStore.getState().isOverlayActive(),
    hiddenByDrag: state.dragHidesViews,
    counters: { ...nativeViewProfilingCounters },
  };
}

/**
 * Native views are inset on left/right/bottom so they don't overlap
 * Allotment split sashes and DOM hover zones. The top edge has no inset
 * because the tab bar sits above it (no sash to protect), and an inset
 * there would create a visible gap between the tabs and the terminal.
 *
 * Note: if a pane is smaller than `NATIVE_VIEW_INSET_X * 2` (or Y)
 * in any dimension (e.g. during rapid resize), `measureElementBounds`
 * returns null and the view retains its previous bounds until the pane
 * grows back. This is acceptable degradation.
 */
const NATIVE_VIEW_INSET_X = 2;
const NATIVE_VIEW_INSET_TOP = 0;
const NATIVE_VIEW_INSET_BOTTOM = 2;

function measureElementBounds(element: HTMLElement): ViewBounds | null {
  const rect = element.getBoundingClientRect();
  const width = Math.max(0, Math.round(rect.width) - NATIVE_VIEW_INSET_X * 2);
  const height = Math.max(
    0,
    Math.round(rect.height) - NATIVE_VIEW_INSET_TOP - NATIVE_VIEW_INSET_BOTTOM,
  );
  if (width === 0 || height === 0) return null;

  return {
    x: Math.round(rect.left) + NATIVE_VIEW_INSET_X,
    y: Math.round(rect.top) + NATIVE_VIEW_INSET_TOP,
    width,
    height,
  };
}

function ensureVisibleLayoutObserver(): void {
  if (!visibleLayoutObserver) {
    visibleLayoutObserver = new ResizeObserver(() => {
      scheduleVisibleBoundsSync();
    });
  }
}

function setVisibleLayoutListenersEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  if (enabled) {
    if (resizeListenerAttached) return;
    window.addEventListener("resize", scheduleVisibleBoundsSync);
    window.addEventListener("scroll", scheduleVisibleBoundsSync, true);
    resizeListenerAttached = true;
    return;
  }

  if (!resizeListenerAttached) return;

  window.removeEventListener("resize", scheduleVisibleBoundsSync);
  window.removeEventListener("scroll", scheduleVisibleBoundsSync, true);
  resizeListenerAttached = false;

  if (visibleBoundsFrameId !== null) {
    cancelAnimationFrame(visibleBoundsFrameId);
    visibleBoundsFrameId = null;
  }
}

function getVisibleNativeViewIds(
  state: Pick<NativeViewState, "visibleTerminals" | "visibleBrowsers">,
): string[] {
  return [...state.visibleTerminals, ...state.visibleBrowsers];
}

function hasObservedVisibleElements(): boolean {
  return observedElements.size > 0;
}

function syncVisibleBoundsNow(): void {
  visibleBoundsFrameId = null;
  nativeViewProfilingCounters.visibleBoundsSyncPasses++;
  const state = useNativeViewStore.getState();
  for (const id of getVisibleNativeViewIds(state)) {
    const element = elementCache.get(id);
    if (!element) continue;
    const next = measureElementBounds(element);
    if (!next) continue;
    updateNativeViewBounds(id, next);
  }
}

function scheduleVisibleBoundsSync(): void {
  if (typeof window === "undefined") return;
  if (!hasObservedVisibleElements()) {
    setVisibleLayoutListenersEnabled(false);
    if (visibleBoundsFrameId !== null) {
      cancelAnimationFrame(visibleBoundsFrameId);
      visibleBoundsFrameId = null;
    }
    return;
  }

  ensureVisibleLayoutObserver();
  setVisibleLayoutListenersEnabled(true);
  if (visibleBoundsFrameId !== null) {
    return;
  }
  visibleBoundsFrameId = requestAnimationFrame(syncVisibleBoundsNow);
}

function refreshObservedVisibleElements(): void {
  const visibleIds = new Set(getVisibleNativeViewIds(useNativeViewStore.getState()));
  if (visibleIds.size > 0) {
    ensureVisibleLayoutObserver();
  }

  if (visibleLayoutObserver) {
    for (const [id, element] of observedElements) {
      const current = elementCache.get(id);
      if (!visibleIds.has(id) || current !== element) {
        visibleLayoutObserver.unobserve(element);
        observedElements.delete(id);
      }
    }
  }

  if (visibleIds.size === 0) {
    setVisibleLayoutListenersEnabled(false);
    return;
  }

  if (!visibleLayoutObserver) return;

  for (const id of visibleIds) {
    const element = elementCache.get(id);
    if (!element || observedElements.get(id) === element) continue;
    visibleLayoutObserver.observe(element);
    observedElements.set(id, element);
  }

  setVisibleLayoutListenersEnabled(observedElements.size > 0);
}

function getLatestBounds(id: string): ViewBounds | null {
  const element = elementCache.get(id);
  if (element) {
    const liveBounds = measureElementBounds(element);
    if (liveBounds) {
      boundsCache.set(id, liveBounds);
      return liveBounds;
    }
  }

  return boundsCache.get(id) ?? null;
}

export function setNativeViewElement(id: string, element: HTMLElement | null): void {
  if (element) {
    elementCache.set(id, element);
    if (getVisibleNativeViewIds(useNativeViewStore.getState()).includes(id)) {
      refreshObservedVisibleElements();
      scheduleVisibleBoundsSync();
    }
    return;
  }

  elementCache.delete(id);
  const observed = observedElements.get(id);
  if (observed && visibleLayoutObserver) {
    visibleLayoutObserver.unobserve(observed);
  }
  observedElements.delete(id);
  if (observedElements.size === 0) {
    setVisibleLayoutListenersEnabled(false);
  }
}

/**
 * Update the cached bounds for a native view and, if the view is currently
 * visible, immediately send the new bounds to the main process via IPC.
 */
export function updateNativeViewBounds(id: string, bounds: ViewBounds): void {
  if (boundsEqual(boundsCache.get(id), bounds)) {
    return;
  }

  boundsCache.set(id, bounds);

  const state = useNativeViewStore.getState();
  const viewType = state.views[id];
  if (viewType === undefined) return;

  if (viewType === "terminal" && state.visibleTerminals.includes(id)) {
    recordBoundsSync();
    void window.api.terminal.setBounds(id, bounds);
  } else if (viewType === "browser" && state.visibleBrowsers.includes(id)) {
    recordBoundsSync();
    void window.api.browser.setBounds(id, bounds);
  }
}

export function clearNativeViewBounds(id: string): void {
  boundsCache.delete(id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNativeViewStore = create<NativeViewState>()((set, get) => ({
  views: {},
  visibleTerminals: [],
  visibleBrowsers: [],
  dragHidesViews: false,

  register(id, type) {
    const { views } = get();
    if (views[id] === type) return;
    nativeViewProfilingCounters.registerCalls++;
    set({ views: { ...views, [id]: type } });
    get().reconcile();
  },

  unregister(id) {
    const { views } = get();
    if (!(id in views)) return;
    nativeViewProfilingCounters.unregisterCalls++;
    const next = { ...views };
    delete next[id];
    boundsCache.delete(id);
    set({ views: next });
    get().reconcile();
  },

  setDragHidesViews(active) {
    if (get().dragHidesViews === active) return;
    set({ dragHidesViews: active });
    get().reconcile();
  },

  reconcile() {
    nativeViewProfilingCounters.reconcileCalls++;
    const { views, visibleTerminals, visibleBrowsers, dragHidesViews } = get();
    const wsState = useWorkspaceStore.getState();
    const overlayActive = useSettingsStore.getState().isOverlayActive();
    const shouldShowAny = !overlayActive && !dragHidesViews;

    const desiredTerminals: string[] = [];
    const desiredBrowsers: string[] = [];

    if (shouldShowAny) {
      const activeWs = wsState.workspaces.find((w) => w.id === wsState.activeWorkspaceId);
      if (activeWs) {
        const groupIds = collectGroupIds(activeWs.root);
        for (const groupId of groupIds) {
          const group = wsState.paneGroups[groupId];
          if (!group) continue;
          const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
          if (!activeTab) continue;
          const viewType = views[activeTab.paneId];
          if (viewType === "terminal") {
            desiredTerminals.push(activeTab.paneId);
          } else if (viewType === "browser") {
            desiredBrowsers.push(activeTab.paneId);
          }
        }
      }
    }

    const terminalsChanged = !arraysEqual(desiredTerminals, visibleTerminals);
    const browsersChanged = !arraysEqual(desiredBrowsers, visibleBrowsers);
    if (!terminalsChanged && !browsersChanged) return;

    // Send bounds for newly-visible views BEFORE showing them (prevents flash)
    if (terminalsChanged) {
      for (const id of desiredTerminals) {
        if (!visibleTerminals.includes(id)) {
          const b = getLatestBounds(id);
          if (b) {
            recordBoundsSync();
            void window.api.terminal.setBounds(id, b);
          }
        }
      }
      void window.api.terminal.setVisibleSurfaces(desiredTerminals);
    }

    if (browsersChanged) {
      for (const id of desiredBrowsers) {
        if (!visibleBrowsers.includes(id)) {
          const b = getLatestBounds(id);
          if (b) {
            recordBoundsSync();
            void window.api.browser.setBounds(id, b);
          }
        }
      }
      void window.api.browser.setVisiblePanes(desiredBrowsers);
    }

    // Blur terminals when transitioning from visible to hidden
    if (overlayActive && visibleTerminals.length > 0 && desiredTerminals.length === 0) {
      void window.api.terminal.blur();
    }

    set({
      visibleTerminals: desiredTerminals,
      visibleBrowsers: desiredBrowsers,
    });

    refreshObservedVisibleElements();
    scheduleVisibleBoundsSync();
  },
}));

// ---------------------------------------------------------------------------
// Cross-store subscriptions — fire reconcile when workspace or settings change.
// Must be initialized explicitly (not at module level) to avoid import-order
// issues in tests where stores may not yet be defined.
// ---------------------------------------------------------------------------

let subscriptionsInitialized = false;

/**
 * Extract a lightweight fingerprint of the workspace state that affects
 * native-view visibility.  Only changes to this fingerprint should trigger
 * a reconcile — title/cwd/focus/sidebar changes are irrelevant.
 */
function getVisibilityKey(wsState: {
  activeWorkspaceId: string;
  workspaces: { id: string; root: import("../types/workspace").SplitNode }[];
  paneGroups: Record<string, { activeTabId: string; tabs: { id: string; paneId: string }[] }>;
}): string {
  const activeWs = wsState.workspaces.find((w) => w.id === wsState.activeWorkspaceId);
  if (!activeWs) return wsState.activeWorkspaceId;
  const groupIds = collectGroupIds(activeWs.root);
  const parts = [wsState.activeWorkspaceId];
  for (const gid of groupIds) {
    const group = wsState.paneGroups[gid];
    if (!group) continue;
    const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
    if (activeTab) parts.push(activeTab.paneId);
  }
  return parts.join(",");
}

function getTrackedGroupIds(wsState: {
  activeWorkspaceId: string;
  workspaces: { id: string; root: import("../types/workspace").SplitNode }[];
}): string[] {
  const activeWs = wsState.workspaces.find((w) => w.id === wsState.activeWorkspaceId);
  return activeWs ? collectGroupIds(activeWs.root) : [];
}

export function initNativeViewSubscriptions(): void {
  if (subscriptionsInitialized) return;
  subscriptionsInitialized = true;

  // Only reconcile when fields that affect visibility actually change:
  // activeWorkspaceId, split-tree structure, or which tab is active per group.
  const initialWorkspaceState = useWorkspaceStore.getState();
  let lastActiveWorkspaceId = initialWorkspaceState.activeWorkspaceId;
  let lastWorkspaces = initialWorkspaceState.workspaces;
  let lastPaneGroups = initialWorkspaceState.paneGroups;
  let lastTrackedGroupIds = getTrackedGroupIds(initialWorkspaceState);
  let lastTrackedGroups = lastTrackedGroupIds.map(
    (groupId) => initialWorkspaceState.paneGroups[groupId],
  );
  let lastVisibilityKey = getVisibilityKey(initialWorkspaceState);
  useWorkspaceStore.subscribe(() => {
    const state = useWorkspaceStore.getState();
    if (
      state.activeWorkspaceId === lastActiveWorkspaceId &&
      state.workspaces === lastWorkspaces &&
      state.paneGroups === lastPaneGroups
    ) {
      return;
    }

    if (
      state.activeWorkspaceId === lastActiveWorkspaceId &&
      state.workspaces === lastWorkspaces &&
      state.paneGroups !== lastPaneGroups &&
      lastTrackedGroupIds.every(
        (groupId, index) => state.paneGroups[groupId] === lastTrackedGroups[index],
      )
    ) {
      lastPaneGroups = state.paneGroups;
      return;
    }

    lastActiveWorkspaceId = state.activeWorkspaceId;
    lastWorkspaces = state.workspaces;
    lastPaneGroups = state.paneGroups;
    lastTrackedGroupIds = getTrackedGroupIds(state);
    lastTrackedGroups = lastTrackedGroupIds.map((groupId) => state.paneGroups[groupId]);

    const key = getVisibilityKey(state);
    if (key === lastVisibilityKey) return;
    lastVisibilityKey = key;
    useNativeViewStore.getState().reconcile();
  });

  // Only reconcile when overlay state actually changes.
  let lastOverlayActive = useSettingsStore.getState().isOverlayActive();
  useSettingsStore.subscribe(() => {
    const current = useSettingsStore.getState().isOverlayActive();
    if (current === lastOverlayActive) return;
    lastOverlayActive = current;
    useNativeViewStore.getState().reconcile();
  });
}

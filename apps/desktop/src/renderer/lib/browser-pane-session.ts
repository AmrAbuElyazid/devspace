export const MAX_INACTIVE_BROWSER_PANES = 2;

type BrowserPaneSessionSnapshot = Readonly<{
  phase: "missing" | "pending" | "ready" | "error";
  generation: number;
  error: string | null;
}>;

type BrowserPaneRecord = {
  active: boolean;
  snapshot: BrowserPaneSessionSnapshot;
  lastUsed: number;
};

const browserPanes = new Map<string, BrowserPaneRecord>();
const generations = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
let activitySequence = 0;
const MISSING_BROWSER_PANE_SNAPSHOT: BrowserPaneSessionSnapshot = Object.freeze({
  phase: "missing",
  generation: 0,
  error: null,
});

function notifyPaneChanged(paneId: string): void {
  for (const listener of listeners.get(paneId) ?? []) listener();
}

function nextGeneration(paneId: string): number {
  const generation = (generations.get(paneId) ?? 0) + 1;
  generations.set(paneId, generation);
  return generation;
}

export function subscribeBrowserPane(paneId: string, listener: () => void): () => void {
  const paneListeners = listeners.get(paneId) ?? new Set<() => void>();
  paneListeners.add(listener);
  listeners.set(paneId, paneListeners);
  return () => {
    paneListeners.delete(listener);
    if (paneListeners.size === 0) listeners.delete(paneId);
  };
}

export function getBrowserPaneSessionSnapshot(paneId: string): BrowserPaneSessionSnapshot {
  return browserPanes.get(paneId)?.snapshot ?? MISSING_BROWSER_PANE_SNAPSHOT;
}

function enforceWarmPaneLimit(destroyPane: (paneId: string) => void): void {
  const inactive = Array.from(browserPanes.entries())
    .filter(([, record]) => record.snapshot.phase === "ready" && !record.active)
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const evictionCount = Math.max(0, inactive.length - MAX_INACTIVE_BROWSER_PANES);

  for (let index = 0; index < evictionCount; index++) {
    const paneId = inactive[index]?.[0];
    if (!paneId) continue;
    browserPanes.delete(paneId);
    nextGeneration(paneId);
    destroyPane(paneId);
    notifyPaneChanged(paneId);
  }
}

export function hasCreatedBrowserPane(paneId: string): boolean {
  const phase = browserPanes.get(paneId)?.snapshot.phase;
  return phase === "pending" || phase === "ready";
}

export function markBrowserPaneCreated(paneId: string): number {
  const generation = nextGeneration(paneId);
  browserPanes.set(paneId, {
    active: true,
    snapshot: { phase: "pending", generation, error: null },
    lastUsed: ++activitySequence,
  });
  notifyPaneChanged(paneId);
  return generation;
}

export function markBrowserPaneReady(
  paneId: string,
  destroyPane: (paneId: string) => void,
  generation?: number,
): boolean {
  const record = browserPanes.get(paneId);
  if (
    !record ||
    record.snapshot.phase !== "pending" ||
    (generation !== undefined && record.snapshot.generation !== generation)
  ) {
    return false;
  }
  record.snapshot = {
    phase: "ready",
    generation: record.snapshot.generation,
    error: null,
  };
  enforceWarmPaneLimit(destroyPane);
  notifyPaneChanged(paneId);
  return true;
}

export function markBrowserPaneFailed(paneId: string, generation: number, error: string): boolean {
  const record = browserPanes.get(paneId);
  if (!record || record.snapshot.generation !== generation) return false;
  record.snapshot = { phase: "error", generation, error };
  notifyPaneChanged(paneId);
  return true;
}

export function markBrowserPaneActive(paneId: string): void {
  const record = browserPanes.get(paneId);
  if (!record) return;
  record.active = true;
  record.lastUsed = ++activitySequence;
}

export function markBrowserPaneInactive(
  paneId: string,
  destroyPane: (paneId: string) => void,
): void {
  const record = browserPanes.get(paneId);
  if (!record) return;
  record.active = false;
  record.lastUsed = ++activitySequence;
  enforceWarmPaneLimit(destroyPane);
}

export function markBrowserPaneDestroyed(paneId: string): void {
  browserPanes.delete(paneId);
  nextGeneration(paneId);
  notifyPaneChanged(paneId);
}

export function resetTrackedBrowserPanesForTests(): void {
  browserPanes.clear();
  generations.clear();
  listeners.clear();
  activitySequence = 0;
}

export const MAX_INACTIVE_EMBEDDED_TOOL_VIEWS = 1;

type EmbeddedToolViewSnapshot = Readonly<{
  phase: "missing" | "pending" | "ready" | "error";
  generation: number;
  error: string | null;
}>;

type EmbeddedToolViewRecord = {
  active: boolean;
  snapshot: EmbeddedToolViewSnapshot;
  lastUsed: number;
  evict: () => void;
};

const embeddedToolViews = new Map<string, EmbeddedToolViewRecord>();
const generations = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
let activitySequence = 0;
const MISSING_EMBEDDED_TOOL_VIEW_SNAPSHOT: EmbeddedToolViewSnapshot = Object.freeze({
  phase: "missing",
  generation: 0,
  error: null,
});

function notifyViewChanged(paneId: string): void {
  for (const listener of listeners.get(paneId) ?? []) listener();
}

function nextGeneration(paneId: string): number {
  const generation = (generations.get(paneId) ?? 0) + 1;
  generations.set(paneId, generation);
  return generation;
}

export function subscribeEmbeddedToolView(paneId: string, listener: () => void): () => void {
  const viewListeners = listeners.get(paneId) ?? new Set<() => void>();
  viewListeners.add(listener);
  listeners.set(paneId, viewListeners);
  return () => {
    viewListeners.delete(listener);
    if (viewListeners.size === 0) listeners.delete(paneId);
  };
}

export function getEmbeddedToolViewSnapshot(paneId: string): EmbeddedToolViewSnapshot {
  return embeddedToolViews.get(paneId)?.snapshot ?? MISSING_EMBEDDED_TOOL_VIEW_SNAPSHOT;
}

function enforceWarmViewLimit(): void {
  const inactive = [...embeddedToolViews.entries()]
    .filter(([, record]) => record.snapshot.phase === "ready" && !record.active)
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const evictionCount = Math.max(0, inactive.length - MAX_INACTIVE_EMBEDDED_TOOL_VIEWS);

  for (let index = 0; index < evictionCount; index++) {
    const entry = inactive[index];
    if (!entry) continue;
    const [paneId, record] = entry;
    embeddedToolViews.delete(paneId);
    nextGeneration(paneId);
    record.evict();
    notifyViewChanged(paneId);
  }
}

export function hasCreatedEmbeddedToolView(paneId: string): boolean {
  const phase = embeddedToolViews.get(paneId)?.snapshot.phase;
  return phase === "pending" || phase === "ready";
}

export function markEmbeddedToolViewCreated(paneId: string, evict: () => void): number {
  const generation = nextGeneration(paneId);
  embeddedToolViews.set(paneId, {
    active: true,
    snapshot: { phase: "pending", generation, error: null },
    lastUsed: ++activitySequence,
    evict,
  });
  notifyViewChanged(paneId);
  return generation;
}

export function markEmbeddedToolViewReady(paneId: string, generation?: number): boolean {
  const record = embeddedToolViews.get(paneId);
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
  enforceWarmViewLimit();
  notifyViewChanged(paneId);
  return true;
}

export function markEmbeddedToolViewFailed(
  paneId: string,
  generation: number,
  error: string,
): boolean {
  const record = embeddedToolViews.get(paneId);
  if (!record || record.snapshot.generation !== generation) return false;
  record.snapshot = { phase: "error", generation, error };
  notifyViewChanged(paneId);
  return true;
}

export function markEmbeddedToolViewActive(paneId: string): void {
  const record = embeddedToolViews.get(paneId);
  if (!record) return;
  record.active = true;
  record.lastUsed = ++activitySequence;
}

export function markEmbeddedToolViewInactive(paneId: string): void {
  const record = embeddedToolViews.get(paneId);
  if (!record) return;
  record.active = false;
  record.lastUsed = ++activitySequence;
  enforceWarmViewLimit();
}

export function markEmbeddedToolViewDestroyed(paneId: string): void {
  embeddedToolViews.delete(paneId);
  nextGeneration(paneId);
  notifyViewChanged(paneId);
}

export function resetTrackedEmbeddedToolViewsForTests(): void {
  embeddedToolViews.clear();
  generations.clear();
  listeners.clear();
  activitySequence = 0;
}

export const MAX_INACTIVE_EMBEDDED_TOOL_VIEWS = 1;

type EmbeddedToolViewRecord = {
  active: boolean;
  ready: boolean;
  lastUsed: number;
  evict: () => void;
};

const embeddedToolViews = new Map<string, EmbeddedToolViewRecord>();
let activitySequence = 0;

function enforceWarmViewLimit(): void {
  const inactive = [...embeddedToolViews.entries()]
    .filter(([, record]) => record.ready && !record.active)
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const evictionCount = Math.max(0, inactive.length - MAX_INACTIVE_EMBEDDED_TOOL_VIEWS);

  for (let index = 0; index < evictionCount; index++) {
    const entry = inactive[index];
    if (!entry) continue;
    const [paneId, record] = entry;
    embeddedToolViews.delete(paneId);
    record.evict();
  }
}

export function hasCreatedEmbeddedToolView(paneId: string): boolean {
  return embeddedToolViews.has(paneId);
}

export function markEmbeddedToolViewCreated(paneId: string, evict: () => void): void {
  embeddedToolViews.set(paneId, {
    active: true,
    ready: false,
    lastUsed: ++activitySequence,
    evict,
  });
}

export function markEmbeddedToolViewReady(paneId: string): void {
  const record = embeddedToolViews.get(paneId);
  if (!record) return;
  record.ready = true;
  enforceWarmViewLimit();
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
}

export function resetTrackedEmbeddedToolViewsForTests(): void {
  embeddedToolViews.clear();
  activitySequence = 0;
}

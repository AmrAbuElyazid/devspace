type TerminalSurfaceBackend = "direct" | "managed-tmux" | "external-tmux";

type TerminalSurfaceSnapshot = Readonly<{
  phase: "missing" | "pending" | "ready" | "closed" | "error";
  generation: number;
  error: string | null;
}>;

export const MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES = 6;

type TerminalSurfaceRecord = {
  backend: TerminalSurfaceBackend;
  active: boolean;
  snapshot: TerminalSurfaceSnapshot;
  lastUsed: number;
};

type TerminalSurfaceSessionState = {
  terminalSurfaces: Map<string, TerminalSurfaceRecord>;
  generations: Map<string, number>;
  listeners: Map<string, Set<() => void>>;
  activitySequence: number;
  lifecycle: {
    created: number;
    ready: number;
    activated: number;
    deactivated: number;
    evicted: number;
    closed: number;
    removed: number;
  };
};

const TERMINAL_SURFACE_SESSION_STATE_KEY = "__DEVSPACE_TERMINAL_SURFACE_SESSION_STATE_V2__";
const terminalSurfaceSessionGlobal = globalThis as typeof globalThis & {
  [TERMINAL_SURFACE_SESSION_STATE_KEY]?: TerminalSurfaceSessionState;
};
const terminalSurfaceSessionState = (terminalSurfaceSessionGlobal[
  TERMINAL_SURFACE_SESSION_STATE_KEY
] ??= {
  terminalSurfaces: new Map<string, TerminalSurfaceRecord>(),
  generations: new Map<string, number>(),
  listeners: new Map<string, Set<() => void>>(),
  activitySequence: 0,
  lifecycle: {
    created: 0,
    ready: 0,
    activated: 0,
    deactivated: 0,
    evicted: 0,
    closed: 0,
    removed: 0,
  },
});
const terminalSurfaces = terminalSurfaceSessionState.terminalSurfaces;
const MISSING_SURFACE_SNAPSHOT: TerminalSurfaceSnapshot = Object.freeze({
  phase: "missing",
  generation: 0,
  error: null,
});

function notifySurfaceChanged(surfaceId: string): void {
  for (const listener of terminalSurfaceSessionState.listeners.get(surfaceId) ?? []) listener();
}

function nextSurfaceGeneration(surfaceId: string): number {
  const generation = (terminalSurfaceSessionState.generations.get(surfaceId) ?? 0) + 1;
  terminalSurfaceSessionState.generations.set(surfaceId, generation);
  return generation;
}

export function subscribeTerminalSurface(surfaceId: string, listener: () => void): () => void {
  const listeners = terminalSurfaceSessionState.listeners.get(surfaceId) ?? new Set<() => void>();
  listeners.add(listener);
  terminalSurfaceSessionState.listeners.set(surfaceId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) terminalSurfaceSessionState.listeners.delete(surfaceId);
  };
}

export function getTerminalSurfaceSnapshot(surfaceId: string): TerminalSurfaceSnapshot {
  return terminalSurfaces.get(surfaceId)?.snapshot ?? MISSING_SURFACE_SNAPSHOT;
}

export function getTerminalSurfaceSessionSnapshot(): {
  total: number;
  active: number;
  ready: number;
  inactivePersistent: number;
  byBackend: Record<TerminalSurfaceBackend, number>;
  lifecycle: TerminalSurfaceSessionState["lifecycle"];
} {
  const snapshot = {
    total: terminalSurfaces.size,
    active: 0,
    ready: 0,
    inactivePersistent: 0,
    byBackend: { direct: 0, "managed-tmux": 0, "external-tmux": 0 },
    lifecycle: { ...terminalSurfaceSessionState.lifecycle },
  };

  for (const record of terminalSurfaces.values()) {
    snapshot.byBackend[record.backend] += 1;
    if (record.active) snapshot.active += 1;
    if (record.snapshot.phase === "ready") snapshot.ready += 1;
    if (record.snapshot.phase === "ready" && !record.active && canDetachSurface(record)) {
      snapshot.inactivePersistent += 1;
    }
  }

  return snapshot;
}

function nextActivitySequence(): number {
  terminalSurfaceSessionState.activitySequence += 1;
  return terminalSurfaceSessionState.activitySequence;
}

function canDetachSurface(record: TerminalSurfaceRecord): boolean {
  return record.backend === "managed-tmux" || record.backend === "external-tmux";
}

function enforceWarmSurfaceLimit(destroySurface: (surfaceId: string) => void): void {
  const inactivePersistentSurfaces = Array.from(terminalSurfaces.entries())
    .filter(
      ([, record]) =>
        record.snapshot.phase === "ready" && !record.active && canDetachSurface(record),
    )
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);

  const evictionCount = Math.max(
    0,
    inactivePersistentSurfaces.length - MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES,
  );
  for (let index = 0; index < evictionCount; index++) {
    const surfaceId = inactivePersistentSurfaces[index]?.[0];
    if (!surfaceId) continue;
    terminalSurfaces.delete(surfaceId);
    nextSurfaceGeneration(surfaceId);
    terminalSurfaceSessionState.lifecycle.evicted += 1;
    destroySurface(surfaceId);
    notifySurfaceChanged(surfaceId);
  }
}

export function hasCreatedTerminalSurface(surfaceId: string): boolean {
  const phase = terminalSurfaces.get(surfaceId)?.snapshot.phase;
  return phase === "pending" || phase === "ready";
}

/** Mark a surface creation as in flight so React remounts do not duplicate it. */
export function markTerminalSurfaceCreated(
  surfaceId: string,
  backend: TerminalSurfaceBackend = "direct",
): number {
  const generation = nextSurfaceGeneration(surfaceId);
  terminalSurfaceSessionState.lifecycle.created += 1;
  terminalSurfaces.set(surfaceId, {
    backend,
    active: true,
    snapshot: { phase: "pending", generation, error: null },
    lastUsed: nextActivitySequence(),
  });
  notifySurfaceChanged(surfaceId);
  return generation;
}

export function markTerminalSurfaceReady(
  surfaceId: string,
  destroySurface: (surfaceId: string) => void,
  generation?: number,
): boolean {
  const record = terminalSurfaces.get(surfaceId);
  if (
    !record ||
    record.snapshot.phase !== "pending" ||
    (generation !== undefined && record.snapshot.generation !== generation)
  ) {
    return false;
  }
  terminalSurfaceSessionState.lifecycle.ready += 1;
  record.snapshot = {
    phase: "ready",
    generation: record.snapshot.generation,
    error: null,
  };
  enforceWarmSurfaceLimit(destroySurface);
  notifySurfaceChanged(surfaceId);
  return true;
}

export function markTerminalSurfaceFailed(
  surfaceId: string,
  generation: number,
  error: string,
): boolean {
  const record = terminalSurfaces.get(surfaceId);
  if (!record || record.snapshot.generation !== generation) return false;
  record.snapshot = { phase: "error", generation, error };
  notifySurfaceChanged(surfaceId);
  return true;
}

export function markTerminalSurfaceActive(surfaceId: string): void {
  const record = terminalSurfaces.get(surfaceId);
  if (!record) return;
  terminalSurfaceSessionState.lifecycle.activated += 1;
  record.active = true;
  record.lastUsed = nextActivitySequence();
}

export function markTerminalSurfaceInactive(
  surfaceId: string,
  destroySurface: (surfaceId: string) => void,
): void {
  const record = terminalSurfaces.get(surfaceId);
  if (!record) return;
  terminalSurfaceSessionState.lifecycle.deactivated += 1;
  record.active = false;
  record.lastUsed = nextActivitySequence();
  enforceWarmSurfaceLimit(destroySurface);
}

export function markTerminalSurfaceDestroyed(
  surfaceId: string,
  reason: "closed" | "removed" = "removed",
): void {
  terminalSurfaceSessionState.lifecycle[reason] += 1;
  const record = terminalSurfaces.get(surfaceId);
  if (reason === "closed" && record) {
    record.snapshot = {
      phase: "closed",
      generation: record.snapshot.generation,
      error: "The terminal session ended.",
    };
  } else {
    terminalSurfaces.delete(surfaceId);
    nextSurfaceGeneration(surfaceId);
  }
  notifySurfaceChanged(surfaceId);
}

export function destroyTrackedTerminalSurfaces(
  surfaceIds: Iterable<string>,
  destroySurface: (surfaceId: string) => void,
): string[] {
  const destroyedSurfaceIds: string[] = [];

  for (const surfaceId of surfaceIds) {
    if (!terminalSurfaces.has(surfaceId)) {
      continue;
    }

    terminalSurfaces.delete(surfaceId);
    nextSurfaceGeneration(surfaceId);
    terminalSurfaceSessionState.lifecycle.removed += 1;
    destroySurface(surfaceId);
    destroyedSurfaceIds.push(surfaceId);
    notifySurfaceChanged(surfaceId);
  }

  return destroyedSurfaceIds;
}

export function resetTrackedTerminalSurfacesForTests(): void {
  terminalSurfaces.clear();
  terminalSurfaceSessionState.generations.clear();
  terminalSurfaceSessionState.listeners.clear();
  terminalSurfaceSessionState.activitySequence = 0;
  for (const key of Object.keys(terminalSurfaceSessionState.lifecycle) as Array<
    keyof TerminalSurfaceSessionState["lifecycle"]
  >) {
    terminalSurfaceSessionState.lifecycle[key] = 0;
  }
}

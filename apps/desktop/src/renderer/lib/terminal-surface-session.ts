type TerminalSurfaceBackend = "direct" | "managed-tmux" | "external-tmux";

export const MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES = 6;

type TerminalSurfaceRecord = {
  backend: TerminalSurfaceBackend;
  active: boolean;
  ready: boolean;
  lastUsed: number;
};

type TerminalSurfaceSessionState = {
  terminalSurfaces: Map<string, TerminalSurfaceRecord>;
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

const TERMINAL_SURFACE_SESSION_STATE_KEY = "__DEVSPACE_TERMINAL_SURFACE_SESSION_STATE__";
const terminalSurfaceSessionGlobal = globalThis as typeof globalThis & {
  [TERMINAL_SURFACE_SESSION_STATE_KEY]?: TerminalSurfaceSessionState;
};
const terminalSurfaceSessionState = (terminalSurfaceSessionGlobal[
  TERMINAL_SURFACE_SESSION_STATE_KEY
] ??= {
  terminalSurfaces: new Map<string, TerminalSurfaceRecord>(),
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
    if (record.ready) snapshot.ready += 1;
    if (record.ready && !record.active && canDetachSurface(record)) {
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
    .filter(([, record]) => record.ready && !record.active && canDetachSurface(record))
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);

  const evictionCount = Math.max(
    0,
    inactivePersistentSurfaces.length - MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES,
  );
  for (let index = 0; index < evictionCount; index++) {
    const surfaceId = inactivePersistentSurfaces[index]?.[0];
    if (!surfaceId) continue;
    terminalSurfaces.delete(surfaceId);
    terminalSurfaceSessionState.lifecycle.evicted += 1;
    destroySurface(surfaceId);
  }
}

export function hasCreatedTerminalSurface(surfaceId: string): boolean {
  return terminalSurfaces.has(surfaceId);
}

/** Mark a surface creation as in flight so React remounts do not duplicate it. */
export function markTerminalSurfaceCreated(
  surfaceId: string,
  backend: TerminalSurfaceBackend = "direct",
): void {
  terminalSurfaceSessionState.lifecycle.created += 1;
  terminalSurfaces.set(surfaceId, {
    backend,
    active: true,
    ready: false,
    lastUsed: nextActivitySequence(),
  });
}

export function markTerminalSurfaceReady(
  surfaceId: string,
  destroySurface: (surfaceId: string) => void,
): void {
  const record = terminalSurfaces.get(surfaceId);
  if (!record) return;
  terminalSurfaceSessionState.lifecycle.ready += 1;
  record.ready = true;
  enforceWarmSurfaceLimit(destroySurface);
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
  terminalSurfaces.delete(surfaceId);
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
    terminalSurfaceSessionState.lifecycle.removed += 1;
    destroySurface(surfaceId);
    destroyedSurfaceIds.push(surfaceId);
  }

  return destroyedSurfaceIds;
}

export function resetTrackedTerminalSurfacesForTests(): void {
  terminalSurfaces.clear();
  terminalSurfaceSessionState.activitySequence = 0;
  for (const key of Object.keys(terminalSurfaceSessionState.lifecycle) as Array<
    keyof TerminalSurfaceSessionState["lifecycle"]
  >) {
    terminalSurfaceSessionState.lifecycle[key] = 0;
  }
}

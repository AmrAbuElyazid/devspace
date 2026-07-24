export const MAX_INACTIVE_BROWSER_PANES = 2;

type BrowserPaneRecord = {
  active: boolean;
  ready: boolean;
  lastUsed: number;
};

const browserPanes = new Map<string, BrowserPaneRecord>();
let activitySequence = 0;

function enforceWarmPaneLimit(destroyPane: (paneId: string) => void): void {
  const inactive = Array.from(browserPanes.entries())
    .filter(([, record]) => record.ready && !record.active)
    .toSorted(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const evictionCount = Math.max(0, inactive.length - MAX_INACTIVE_BROWSER_PANES);

  for (let index = 0; index < evictionCount; index++) {
    const paneId = inactive[index]?.[0];
    if (!paneId) continue;
    browserPanes.delete(paneId);
    destroyPane(paneId);
  }
}

export function hasCreatedBrowserPane(paneId: string): boolean {
  return browserPanes.has(paneId);
}

export function markBrowserPaneCreated(paneId: string): void {
  browserPanes.set(paneId, {
    active: true,
    ready: false,
    lastUsed: ++activitySequence,
  });
}

export function markBrowserPaneReady(paneId: string, destroyPane: (paneId: string) => void): void {
  const record = browserPanes.get(paneId);
  if (!record) return;
  record.ready = true;
  enforceWarmPaneLimit(destroyPane);
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
}

export function resetTrackedBrowserPanesForTests(): void {
  browserPanes.clear();
  activitySequence = 0;
}

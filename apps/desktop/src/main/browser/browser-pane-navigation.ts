import type { BrowserPaneManagerDeps, BrowserPaneRecord } from "./browser-types";

/** Matches the pane's page-zoom ceiling, so both kinds of zoom stop together. */
const MAX_PANE_VISUAL_ZOOM = 3;

export type PendingHistoryVisit = {
  url: string;
  visitedAt: number;
};

type WebContentsNavigationHistory = {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
};

function getNavigationHistory(
  webContents: Electron.WebContents | undefined,
): WebContentsNavigationHistory | null {
  const navigationHistory = (
    webContents as
      | (Electron.WebContents & {
          navigationHistory?: WebContentsNavigationHistory;
        })
      | undefined
  )?.navigationHistory;

  return navigationHistory ?? null;
}

export function navigatePaneToUrl(pane: BrowserPaneRecord, url: string): void {
  const loadURL = pane.view.webContents?.loadURL;
  if (typeof loadURL === "function") {
    void loadURL.call(pane.view.webContents, url);
  }
}

export function goBackInPane(pane: BrowserPaneRecord): void {
  const navigationHistory = getNavigationHistory(pane.view.webContents);
  const goBack = navigationHistory?.goBack ?? pane.view.webContents?.goBack;
  if (typeof goBack === "function") {
    goBack.call(navigationHistory ?? pane.view.webContents);
  }
}

export function goForwardInPane(pane: BrowserPaneRecord): void {
  const navigationHistory = getNavigationHistory(pane.view.webContents);
  const goForward = navigationHistory?.goForward ?? pane.view.webContents?.goForward;
  if (typeof goForward === "function") {
    goForward.call(navigationHistory ?? pane.view.webContents);
  }
}

export function reloadPane(pane: BrowserPaneRecord): void {
  const reload = pane.view.webContents?.reload;
  if (typeof reload === "function") {
    reload.call(pane.view.webContents);
  }
}

export function stopPane(pane: BrowserPaneRecord): void {
  const stop = pane.view.webContents?.stop;
  if (typeof stop === "function") {
    stop.call(pane.view.webContents);
  }
}

export function focusPaneWebContents(pane: BrowserPaneRecord): void {
  const focus = pane.view.webContents?.focus;
  if (typeof focus === "function") {
    focus.call(pane.view.webContents);
  }
}

/**
 * Pinch-to-zoom, the magnifying kind: it scales what is already on screen and
 * lets the page be panned around, rather than re-laying it out the way ⌘+ does.
 *
 * Electron ships with it switched off, which is why a trackpad pinch did
 * nothing at all in a pane. The ceiling matches the pane's page-zoom ceiling;
 * the floor is 1 because there is nothing below the layout viewport to reveal.
 */
export function enablePaneVisualZoom(pane: BrowserPaneRecord): void {
  const setVisualZoomLevelLimits = pane.view.webContents?.setVisualZoomLevelLimits;
  if (typeof setVisualZoomLevelLimits === "function") {
    void setVisualZoomLevelLimits.call(pane.view.webContents, 1, MAX_PANE_VISUAL_ZOOM);
  }
}

/**
 * Return a pinched page to life size.
 *
 * Chromium clamps the current scale into whatever limits it is given, so
 * pinning the ceiling to 1 for a moment is what actually drops the zoom — there
 * is no API that resets page scale directly. The restore has to wait for that
 * clamp to land: issued together, the ceiling is back up before anything has
 * been clamped and the page stays exactly as magnified as it was.
 */
export function resetPaneVisualZoom(pane: BrowserPaneRecord): void {
  const webContents = pane.view.webContents;
  const setVisualZoomLevelLimits = webContents?.setVisualZoomLevelLimits;
  if (typeof setVisualZoomLevelLimits !== "function") {
    return;
  }

  void Promise.resolve(setVisualZoomLevelLimits.call(webContents, 1, 1))
    .then(() => {
      // The pane can be closed while the clamp is in flight.
      if (webContents.isDestroyed?.()) return;
      return setVisualZoomLevelLimits.call(webContents, 1, MAX_PANE_VISUAL_ZOOM);
    })
    .catch(() => {
      // A pane torn down mid-reset has no zoom left to restore.
    });
}

export function setPaneZoomFactor(pane: BrowserPaneRecord, zoom: number): void {
  const setZoomFactor = pane.view.webContents?.setZoomFactor;
  if (typeof setZoomFactor === "function") {
    void setZoomFactor.call(pane.view.webContents, zoom);
  }
}

export function syncPaneNavigationState(pane: BrowserPaneRecord): void {
  const navigationHistory = getNavigationHistory(pane.view.webContents);
  const canGoBack = navigationHistory?.canGoBack ?? pane.view.webContents?.canGoBack;
  const canGoForward = navigationHistory?.canGoForward ?? pane.view.webContents?.canGoForward;

  pane.runtimeState.canGoBack =
    typeof canGoBack === "function"
      ? canGoBack.call(navigationHistory ?? pane.view.webContents)
      : false;
  pane.runtimeState.canGoForward =
    typeof canGoForward === "function"
      ? canGoForward.call(navigationHistory ?? pane.view.webContents)
      : false;
}

export function recordCommittedHistoryVisit(
  pane: BrowserPaneRecord,
  url: string,
  pendingHistoryVisits: Map<string, PendingHistoryVisit>,
  historyService: BrowserPaneManagerDeps["historyService"],
): void {
  // Editor panes carry connection tokens in their URLs; never persist them to browser history.
  if (pane.kind === "editor") {
    return;
  }

  const pendingVisit = {
    url,
    visitedAt: Date.now(),
  };

  pendingHistoryVisits.set(pane.runtimeState.paneId, pendingVisit);
  historyService?.recordVisit({
    url,
    title: url,
    visitedAt: pendingVisit.visitedAt,
    source: "devspace",
  });
}

export function refreshPendingHistoryTitle(
  pane: BrowserPaneRecord,
  title: string,
  pendingHistoryVisits: ReadonlyMap<string, PendingHistoryVisit>,
  historyService: BrowserPaneManagerDeps["historyService"],
): void {
  const pendingVisit = pendingHistoryVisits.get(pane.runtimeState.paneId);
  if (!pendingVisit || pendingVisit.url !== pane.runtimeState.url) {
    return;
  }

  historyService?.recordVisit({
    url: pendingVisit.url,
    title,
    visitedAt: pendingVisit.visitedAt,
    source: "devspace",
  });
}

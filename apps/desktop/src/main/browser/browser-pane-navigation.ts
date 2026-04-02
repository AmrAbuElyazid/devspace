import type { BrowserPaneManagerDeps, BrowserPaneRecord } from "./browser-types";

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

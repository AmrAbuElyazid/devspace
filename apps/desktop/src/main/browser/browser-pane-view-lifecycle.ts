import type { BrowserBounds } from "../../shared/browser";
import type { BrowserPaneManagerDeps, BrowserPaneRecord } from "./browser-types";

type BrowserPaneViewDeps = Pick<BrowserPaneManagerDeps, "addChildView" | "removeChildView">;

function applyPaneBounds(pane: BrowserPaneRecord, bounds: BrowserBounds): void {
  pane.bounds = bounds;
  const setBounds = pane.view.setBounds;
  if (typeof setBounds === "function") {
    setBounds.call(pane.view, bounds);
  }
}

function applyPaneZoom(pane: BrowserPaneRecord): void {
  const setZoomFactor = pane.view.webContents?.setZoomFactor;
  if (typeof setZoomFactor === "function") {
    void setZoomFactor.call(pane.view.webContents, pane.runtimeState.currentZoom);
  }
}

export function setPaneBounds(pane: BrowserPaneRecord, bounds: BrowserBounds): void {
  applyPaneBounds(pane, bounds);
}

export function showPaneView(
  pane: BrowserPaneRecord,
  deps: BrowserPaneViewDeps,
  options?: { boundsFirst?: boolean },
): void {
  if (pane.isVisible) {
    return;
  }

  if (options?.boundsFirst && pane.bounds) {
    applyPaneBounds(pane, pane.bounds);
  }

  deps.addChildView(pane.view);

  if (!options?.boundsFirst && pane.bounds) {
    applyPaneBounds(pane, pane.bounds);
  }

  applyPaneZoom(pane);
  pane.isVisible = true;
}

export function hidePaneView(pane: BrowserPaneRecord, deps: BrowserPaneViewDeps): void {
  if (!pane.isVisible) {
    return;
  }

  deps.removeChildView(pane.view);
  pane.isVisible = false;
}

export function syncVisiblePaneViews(
  visiblePaneIds: ReadonlySet<string>,
  panes: Pick<ReadonlyMap<string, BrowserPaneRecord>, "get">,
  paneIds: string[],
  deps: BrowserPaneViewDeps,
): Set<string> {
  const desiredVisible = new Set(paneIds);

  for (const paneId of visiblePaneIds) {
    if (desiredVisible.has(paneId)) {
      continue;
    }

    const pane = panes.get(paneId);
    if (pane) {
      hidePaneView(pane, deps);
    }
  }

  for (const paneId of paneIds) {
    const pane = panes.get(paneId);
    if (!pane) {
      continue;
    }

    showPaneView(pane, deps, { boundsFirst: true });
  }

  return desiredVisible;
}

export function destroyPaneView(pane: BrowserPaneRecord): void {
  const close = (pane.view.webContents as { close?: () => void }).close;
  if (typeof close === "function") {
    close.call(pane.view.webContents);
    return;
  }

  const destroyView = (pane.view as { destroy?: () => void }).destroy;
  if (typeof destroyView === "function") {
    destroyView.call(pane.view);
  }
}

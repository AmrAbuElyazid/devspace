import type { BrowserPaneHistoryTracker } from "./browser-pane-history-tracker";
import {
  enablePaneVisualZoom,
  goBackInPane,
  goForwardInPane,
  syncPaneNavigationState,
} from "./browser-pane-navigation";
import { registerBrowserPaneWebContentsListeners } from "./browser-pane-webcontents-events";
import type {
  BrowserPaneManagerDeps,
  BrowserPaneRecord,
  BrowserRuntimePatch,
} from "./browser-types";

export function registerManagedBrowserPaneWebContentsListeners({
  applyFindResult,
  applyRuntimePatch,
  getAppShortcutBindings,
  historyTracker,
  pane,
  recoverFromCrash,
  sendToRenderer,
}: {
  applyFindResult: (
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ) => void;
  applyRuntimePatch: (paneId: string, patch: BrowserRuntimePatch) => void;
  getAppShortcutBindings: BrowserPaneManagerDeps["getAppShortcutBindings"];
  historyTracker: BrowserPaneHistoryTracker;
  pane: BrowserPaneRecord;
  recoverFromCrash: (pane: BrowserPaneRecord) => boolean;
  sendToRenderer: BrowserPaneManagerDeps["sendToRenderer"];
}): void {
  registerBrowserPaneWebContentsListeners({
    pane,
    sendToRenderer,
    getAppShortcutBindings,
    applyRuntimePatch,
    applyFindResult,
    recoverFromCrash,
    syncNavigationState: syncPaneNavigationState,
    goBack: goBackInPane,
    goForward: goForwardInPane,
    // Browser panes only: an editor pane is a full IDE with its own ideas about
    // gestures, and magnifying its chrome is not one of them.
    enableVisualZoom: (nextPane) => {
      if (nextPane.kind === "browser") {
        enablePaneVisualZoom(nextPane);
      }
    },
    recordCommittedHistoryVisit: (nextPane, url) => {
      historyTracker.recordCommittedVisit(nextPane, url);
    },
    refreshPendingHistoryTitle: (nextPane, title) => {
      historyTracker.refreshPendingTitle(nextPane, title);
    },
  });
}

import type { BrowserPaneHistoryTracker } from "./browser-pane-history-tracker";
import { syncPaneNavigationState } from "./browser-pane-navigation";
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
  sendToRenderer: BrowserPaneManagerDeps["sendToRenderer"];
}): void {
  registerBrowserPaneWebContentsListeners({
    pane,
    sendToRenderer,
    getAppShortcutBindings,
    applyRuntimePatch,
    applyFindResult,
    syncNavigationState: syncPaneNavigationState,
    recordCommittedHistoryVisit: (nextPane, url) => {
      historyTracker.recordCommittedVisit(nextPane, url);
    },
    refreshPendingHistoryTitle: (nextPane, title) => {
      historyTracker.refreshPendingTitle(nextPane, title);
    },
  });
}

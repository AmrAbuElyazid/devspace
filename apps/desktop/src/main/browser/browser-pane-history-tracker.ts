import {
  recordCommittedHistoryVisit,
  refreshPendingHistoryTitle,
  type PendingHistoryVisit,
} from "./browser-pane-navigation";
import type { BrowserPaneManagerDeps, BrowserPaneRecord } from "./browser-types";

export interface BrowserPaneHistoryTracker {
  deletePane: (paneId: string) => void;
  recordCommittedVisit: (pane: BrowserPaneRecord, url: string) => void;
  refreshPendingTitle: (pane: BrowserPaneRecord, title: string) => void;
}

export function createBrowserPaneHistoryTracker(
  historyService: BrowserPaneManagerDeps["historyService"],
): BrowserPaneHistoryTracker {
  const pendingHistoryVisits = new Map<string, PendingHistoryVisit>();

  return {
    deletePane(paneId) {
      pendingHistoryVisits.delete(paneId);
    },
    recordCommittedVisit(pane, url) {
      recordCommittedHistoryVisit(pane, url, pendingHistoryVisits, historyService);
    },
    refreshPendingTitle(pane, title) {
      refreshPendingHistoryTitle(pane, title, pendingHistoryVisits, historyService);
    },
  };
}

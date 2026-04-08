import type { PendingHistoryVisit } from "./browser-pane-navigation";
import type { BrowserPaneRecord } from "./browser-types";

export function registerPaneRecord(
  panes: Map<string, BrowserPaneRecord>,
  paneIdByWebContentsId: Map<number, string>,
  paneId: string,
  pane: BrowserPaneRecord,
): void {
  panes.set(paneId, pane);

  const webContentsId = pane.view.webContents?.id;
  if (typeof webContentsId === "number") {
    paneIdByWebContentsId.set(webContentsId, paneId);
  }
}

export function unregisterPaneRecord(
  panes: Map<string, BrowserPaneRecord>,
  paneIdByWebContentsId: Map<number, string>,
  pendingHistoryVisits: Map<string, PendingHistoryVisit>,
  paneId: string,
  pane: BrowserPaneRecord,
): void {
  panes.delete(paneId);
  pendingHistoryVisits.delete(paneId);

  const webContentsId = pane.view.webContents?.id;
  if (typeof webContentsId === "number") {
    paneIdByWebContentsId.delete(webContentsId);
  }
}

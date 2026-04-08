import type { BrowserFindInPageOptions, BrowserStopFindAction } from "../../shared/browser";
import type { BrowserPaneRecord } from "./browser-types";

export function startPaneFindInPage(
  pane: BrowserPaneRecord,
  query: string,
  options?: BrowserFindInPageOptions,
): void {
  const findInPage = pane.view.webContents?.findInPage;
  if (typeof findInPage === "function") {
    void findInPage.call(pane.view.webContents, query, options);
  }
}

export function stopPaneFindInPage(pane: BrowserPaneRecord, action: BrowserStopFindAction): void {
  const stopFindInPage = pane.view.webContents?.stopFindInPage;
  if (typeof stopFindInPage === "function") {
    stopFindInPage.call(pane.view.webContents, action);
  }
}

export function togglePaneDevTools(pane: BrowserPaneRecord): void {
  const isOpened = pane.view.webContents?.isDevToolsOpened;
  const openDevTools = pane.view.webContents?.openDevTools;
  const closeDevTools = pane.view.webContents?.closeDevTools;
  if (typeof isOpened === "function" && isOpened.call(pane.view.webContents)) {
    if (typeof closeDevTools === "function") {
      closeDevTools.call(pane.view.webContents);
    }
    return;
  }

  if (typeof openDevTools === "function") {
    openDevTools.call(pane.view.webContents);
  }
}

export function executePaneScript(pane: BrowserPaneRecord, script: string): void {
  const executeJavaScript = pane.view.webContents?.executeJavaScript;
  if (typeof executeJavaScript === "function") {
    void executeJavaScript.call(pane.view.webContents, script).catch((err: unknown) => {
      console.warn("[browser-pane] executeScript failed:", err);
    });
  }
}

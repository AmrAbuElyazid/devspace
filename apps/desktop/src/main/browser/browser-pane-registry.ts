import type { BrowserRuntimeState } from "../../shared/browser";
import type { BrowserPaneRecord } from "./browser-types";
import { cloneRuntimeState } from "./browser-runtime-state";

interface BrowserPaneRegistry {
  has(paneId: string): boolean;
  get(paneId: string): BrowserPaneRecord | undefined;
  getRuntimeState(paneId: string): BrowserRuntimeState | undefined;
  isVisible(paneId: string): boolean;
  records(): ReadonlyMap<string, BrowserPaneRecord>;
  register(paneId: string, pane: BrowserPaneRecord): void;
  resolvePaneIdForWebContents(webContentsId: number): string | undefined;
  unregister(paneId: string): BrowserPaneRecord | undefined;
}

export function createBrowserPaneRegistry(): BrowserPaneRegistry {
  const panes = new Map<string, BrowserPaneRecord>();
  const paneIdByWebContentsId = new Map<number, string>();

  return {
    has(paneId) {
      return panes.has(paneId);
    },
    get(paneId) {
      return panes.get(paneId);
    },
    getRuntimeState(paneId) {
      const pane = panes.get(paneId);
      return pane ? cloneRuntimeState(pane.runtimeState) : undefined;
    },
    isVisible(paneId) {
      return panes.get(paneId)?.isVisible ?? false;
    },
    records() {
      return panes;
    },
    register(paneId, pane) {
      panes.set(paneId, pane);

      const webContentsId = pane.view.webContents?.id;
      if (typeof webContentsId === "number") {
        paneIdByWebContentsId.set(webContentsId, paneId);
      }
    },
    resolvePaneIdForWebContents(webContentsId) {
      return paneIdByWebContentsId.get(webContentsId);
    },
    unregister(paneId) {
      const pane = panes.get(paneId);
      if (!pane) {
        return undefined;
      }

      panes.delete(paneId);

      const webContentsId = pane.view.webContents?.id;
      if (typeof webContentsId === "number") {
        paneIdByWebContentsId.delete(webContentsId);
      }

      return pane;
    },
  };
}

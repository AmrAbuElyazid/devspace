import type { Session, View, WebContentsView, WebContentsViewConstructorOptions } from "electron";
import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserFailureState,
  BrowserPermissionRequest,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from "../../shared/browser";
import type { BrowserHistoryRecorder } from "./browser-history-service";

export type BrowserPaneManagerDeps = {
  createView?: (options: WebContentsViewConstructorOptions) => WebContentsView;
  addChildView: (view: View) => void;
  removeChildView: (view: View) => void;
  sendToRenderer: (channel: string, payload: unknown) => void;
  getSession?: () => Session;
  historyService?: BrowserHistoryRecorder;
};

export interface BrowserPaneRecord {
  view: WebContentsView;
  runtimeState: BrowserRuntimeState;
  bounds: BrowserBounds | null;
  isVisible: boolean;
}

export type BrowserRuntimePatch = Partial<
  Pick<
    BrowserRuntimeState,
    | "url"
    | "title"
    | "faviconUrl"
    | "isLoading"
    | "canGoBack"
    | "canGoForward"
    | "isSecure"
    | "securityLabel"
    | "currentZoom"
    | "find"
    | "failure"
  >
>;

export interface BrowserPaneController {
  createPane(paneId: string, initialUrl: string): void;
  destroyPane(paneId: string): void;
  showPane(paneId: string): void;
  hidePane(paneId: string): void;
  isPaneVisible(paneId: string): boolean;
  getRuntimeState(paneId: string): BrowserRuntimeState | undefined;
  applyRuntimePatch(paneId: string, patch: BrowserRuntimePatch): void;
  resolvePaneIdForWebContents(webContentsId: number): string | undefined;
  navigate(paneId: string, url: string): void;
  back(paneId: string): void;
  forward(paneId: string): void;
  reload(paneId: string): void;
  stop(paneId: string): void;
  setBounds(paneId: string, bounds: BrowserBounds): void;
  focusPane(paneId: string): void;
  setZoom(paneId: string, zoom: number): void;
  resetZoom(paneId: string): void;
  findInPage(paneId: string, query: string, options?: BrowserFindInPageOptions): void;
  stopFindInPage(paneId: string, action?: BrowserStopFindAction): void;
  toggleDevTools(paneId: string): void;
  applyFindResult(
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ): void;
  showContextMenu(paneId: string, position?: { x: number; y: number }): void;
  requestPermission(
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ): void;
  resolvePermission(requestToken: string, decision: BrowserPermissionDecision): void;
  reportFailure(
    paneId: string,
    failure: BrowserFailureState,
    options?: { title?: string; isSecure?: boolean; securityLabel?: string | null },
  ): void;
  executeScript(paneId: string, script: string): void;
}

import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserFailureState,
  BrowserPermissionRequest,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from "../../shared/browser";
import type {
  BrowserPaneController,
  BrowserPaneKind,
  BrowserPaneManagerDeps,
  BrowserPaneRecord,
  BrowserRuntimePatch,
} from "./browser-types";
import { registerBrowserPaneWebContentsListeners } from "./browser-pane-webcontents-events";
import {
  destroyPaneView,
  hidePaneView,
  setPaneBounds,
  showPaneView,
  syncVisiblePaneViews,
} from "./browser-pane-view-lifecycle";
import {
  cloneRuntimeState,
  createInitialRuntimeState,
  withDerivedSecurityState,
} from "./browser-runtime-state";

type PendingHistoryVisit = {
  url: string;
  visitedAt: number;
};

type WebContentsNavigationHistory = {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
};

function createElectronView(
  options: Electron.WebContentsViewConstructorOptions,
): Electron.WebContentsView {
  const { WebContentsView } = require("electron") as typeof import("electron");
  return new WebContentsView(options);
}

function createBrowserViewOptions(
  session?: Electron.Session,
): Electron.WebContentsViewConstructorOptions {
  return {
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      safeDialogs: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      ...(session ? { session } : {}),
    },
  };
}

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

type PendingPermissionResolution = (decision: BrowserPermissionDecision) => void;
type PendingPermissionRequest = {
  paneId: string;
  resolve: PendingPermissionResolution;
};

export class BrowserPaneManager implements BrowserPaneController {
  private readonly panes = new Map<string, BrowserPaneRecord>();
  private readonly paneIdByWebContentsId = new Map<number, string>();
  private readonly pendingHistoryVisits = new Map<string, PendingHistoryVisit>();
  private readonly pendingPermissionResolutions = new Map<string, PendingPermissionRequest>();
  private readonly createView: NonNullable<BrowserPaneManagerDeps["createView"]>;

  constructor(private readonly deps: BrowserPaneManagerDeps) {
    this.createView = deps.createView ?? createElectronView;
  }

  createPane(paneId: string, initialUrl: string, kind: BrowserPaneKind = "browser"): void {
    if (this.panes.has(paneId)) {
      return;
    }

    const session = this.deps.getSession?.();
    const view = this.createView(createBrowserViewOptions(session));
    const pane: BrowserPaneRecord = {
      view,
      kind,
      runtimeState: createInitialRuntimeState(paneId, initialUrl),
      bounds: null,
      isVisible: false,
    };

    this.panes.set(paneId, pane);
    const webContentsId = pane.view.webContents?.id;
    if (typeof webContentsId === "number") {
      this.paneIdByWebContentsId.set(webContentsId, paneId);
    }
    this.registerWebContentsListeners(pane);
    this.navigate(paneId, initialUrl);
  }

  destroyPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    hidePaneView(pane, this.deps);
    this.denyPendingPermissionsForPane(paneId);
    this.panes.delete(paneId);
    this.pendingHistoryVisits.delete(paneId);
    const webContentsId = pane.view.webContents?.id;
    if (typeof webContentsId === "number") {
      this.paneIdByWebContentsId.delete(webContentsId);
    }

    destroyPaneView(pane);
  }

  showPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    showPaneView(pane, this.deps);
  }

  hidePane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    hidePaneView(pane, this.deps);
  }

  setVisiblePanes(paneIds: string[]): void {
    syncVisiblePaneViews(this.panes, paneIds, this.deps);
  }

  isPaneVisible(paneId: string): boolean {
    return this.panes.get(paneId)?.isVisible ?? false;
  }

  setBounds(paneId: string, bounds: BrowserBounds): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    setPaneBounds(pane, bounds);
  }

  navigate(paneId: string, url: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.isLoading = true;
    pane.runtimeState.failure = null;
    this.emitStateChange(pane);

    const loadURL = pane.view.webContents?.loadURL;
    if (typeof loadURL === "function") {
      void loadURL.call(pane.view.webContents, url);
    }
  }

  back(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const navigationHistory = getNavigationHistory(pane.view.webContents);
    const goBack = navigationHistory?.goBack ?? pane?.view.webContents?.goBack;
    if (typeof goBack === "function") {
      goBack.call(navigationHistory ?? pane.view.webContents);
    }
  }

  forward(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const navigationHistory = getNavigationHistory(pane.view.webContents);
    const goForward = navigationHistory?.goForward ?? pane?.view.webContents?.goForward;
    if (typeof goForward === "function") {
      goForward.call(navigationHistory ?? pane.view.webContents);
    }
  }

  reload(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const reload = pane?.view.webContents?.reload;
    if (typeof reload === "function") {
      reload.call(pane.view.webContents);
    }
  }

  stop(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const stop = pane?.view.webContents?.stop;
    if (typeof stop === "function") {
      stop.call(pane.view.webContents);
    }
  }

  focusPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const focus = pane?.view.webContents?.focus;
    if (typeof focus === "function") {
      focus.call(pane.view.webContents);
    }
  }

  setZoom(paneId: string, zoom: number): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.currentZoom = zoom;
    this.emitStateChange(pane);

    const setZoomFactor = pane.view.webContents?.setZoomFactor;
    if (typeof setZoomFactor === "function") {
      void setZoomFactor.call(pane.view.webContents, zoom);
    }
  }

  resetZoom(paneId: string): void {
    this.setZoom(paneId, 1);
  }

  findInPage(paneId: string, query: string, options?: BrowserFindInPageOptions): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.find = {
      query,
      activeMatch: 0,
      totalMatches: 0,
    };
    this.emitStateChange(pane);

    const findInPage = pane.view.webContents?.findInPage;
    if (typeof findInPage === "function") {
      void findInPage.call(pane.view.webContents, query, options);
    }
  }

  applyFindResult(
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.find = {
      query: result.query,
      activeMatch: result.activeMatch,
      totalMatches: result.totalMatches,
    };
    this.emitStateChange(pane);
  }

  stopFindInPage(paneId: string, action: BrowserStopFindAction = "clearSelection"): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.find = null;
    this.emitStateChange(pane);

    const stopFindInPage = pane.view.webContents?.stopFindInPage;
    if (typeof stopFindInPage === "function") {
      stopFindInPage.call(pane.view.webContents, action);
    }
  }

  toggleDevTools(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

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

  showContextMenu(_paneId: string, _position?: { x: number; y: number }): void {
    // Placeholder for later browser context-menu wiring.
  }

  executeScript(paneId: string, script: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    const executeJavaScript = pane.view.webContents?.executeJavaScript;
    if (typeof executeJavaScript === "function") {
      void executeJavaScript.call(pane.view.webContents, script).catch((err: unknown) => {
        console.warn("[browser-pane] executeScript failed:", err);
      });
    }
  }

  requestPermission(
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ): void {
    this.pendingPermissionResolutions.set(request.requestToken, {
      paneId: request.paneId,
      resolve,
    });
    this.deps.sendToRenderer("browser:permissionRequested", request);
  }

  resolvePermission(requestToken: string, decision: BrowserPermissionDecision): void {
    const pendingRequest = this.pendingPermissionResolutions.get(requestToken);
    if (!pendingRequest) {
      return;
    }

    this.pendingPermissionResolutions.delete(requestToken);
    pendingRequest.resolve(decision);
  }

  reportFailure(
    paneId: string,
    failure: BrowserFailureState,
    options?: { title?: string; isSecure?: boolean; securityLabel?: string | null },
  ): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    this.applyRuntimePatch(paneId, {
      title: options?.title ?? pane.runtimeState.title,
      faviconUrl: null,
      isLoading: false,
      ...(options?.isSecure !== undefined ? { isSecure: options.isSecure } : {}),
      ...(options?.securityLabel !== undefined ? { securityLabel: options.securityLabel } : {}),
      failure,
    });
  }

  getRuntimeState(paneId: string): BrowserRuntimeState | undefined {
    const pane = this.panes.get(paneId);
    return pane ? cloneRuntimeState(pane.runtimeState) : undefined;
  }

  applyRuntimePatch(paneId: string, patch: BrowserRuntimePatch): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    Object.assign(pane.runtimeState, patch);
    const hasExplicitSecurityState =
      patch.isSecure !== undefined || patch.securityLabel !== undefined;
    if (patch.url !== undefined && !hasExplicitSecurityState) {
      Object.assign(pane.runtimeState, withDerivedSecurityState(patch.url));
    }
    this.emitStateChange(pane);
  }

  resolvePaneIdForWebContents(webContentsId: number): string | undefined {
    return this.paneIdByWebContentsId.get(webContentsId);
  }

  private emitStateChange(pane: BrowserPaneRecord): void {
    this.deps.sendToRenderer("browser:stateChanged", cloneRuntimeState(pane.runtimeState));
  }

  private registerWebContentsListeners(pane: BrowserPaneRecord): void {
    registerBrowserPaneWebContentsListeners({
      pane,
      sendToRenderer: this.deps.sendToRenderer,
      getAppShortcutBindings: this.deps.getAppShortcutBindings,
      applyRuntimePatch: (paneId, patch) => {
        this.applyRuntimePatch(paneId, patch);
      },
      applyFindResult: (paneId, result) => {
        this.applyFindResult(paneId, result);
      },
      syncNavigationState: (nextPane) => {
        this.syncNavigationState(nextPane);
      },
      recordCommittedHistoryVisit: (nextPane, url) => {
        this.recordCommittedHistoryVisit(nextPane, url);
      },
      refreshPendingHistoryTitle: (nextPane, title) => {
        this.refreshPendingHistoryTitle(nextPane, title);
      },
    });
  }

  private syncNavigationState(pane: BrowserPaneRecord): void {
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

  private recordCommittedHistoryVisit(pane: BrowserPaneRecord, url: string): void {
    const pendingVisit = {
      url,
      visitedAt: Date.now(),
    };

    this.pendingHistoryVisits.set(pane.runtimeState.paneId, pendingVisit);
    this.deps.historyService?.recordVisit({
      url,
      title: url,
      visitedAt: pendingVisit.visitedAt,
      source: "devspace",
    });
  }

  private refreshPendingHistoryTitle(pane: BrowserPaneRecord, title: string): void {
    const pendingVisit = this.pendingHistoryVisits.get(pane.runtimeState.paneId);
    if (!pendingVisit || pendingVisit.url !== pane.runtimeState.url) {
      return;
    }

    this.deps.historyService?.recordVisit({
      url: pendingVisit.url,
      title,
      visitedAt: pendingVisit.visitedAt,
      source: "devspace",
    });
  }

  private denyPendingPermissionsForPane(paneId: string): void {
    for (const [requestToken, pendingRequest] of this.pendingPermissionResolutions.entries()) {
      if (pendingRequest.paneId !== paneId) {
        continue;
      }

      this.pendingPermissionResolutions.delete(requestToken);
      pendingRequest.resolve("deny");
    }
  }
}

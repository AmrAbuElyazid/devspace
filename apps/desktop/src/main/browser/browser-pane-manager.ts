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
import { createBrowserPaneRecord, createElectronView } from "./browser-pane-factory";
import { registerBrowserPaneWebContentsListeners } from "./browser-pane-webcontents-events";
import {
  focusPaneWebContents,
  goBackInPane,
  goForwardInPane,
  navigatePaneToUrl,
  recordCommittedHistoryVisit,
  refreshPendingHistoryTitle,
  reloadPane,
  setPaneZoomFactor,
  stopPane,
  syncPaneNavigationState,
  type PendingHistoryVisit,
} from "./browser-pane-navigation";
import {
  denyPendingPermissionsForPane,
  requestBrowserPermission,
  resolveBrowserPermission,
  type PendingPermissionRequest,
} from "./browser-pane-permissions";
import {
  executePaneScript,
  startPaneFindInPage,
  stopPaneFindInPage,
  togglePaneDevTools,
} from "./browser-pane-webcontents-actions";
import {
  destroyPaneView,
  hidePaneView,
  setPaneBounds,
  showPaneView,
  syncVisiblePaneViews,
} from "./browser-pane-view-lifecycle";
import {
  applyRuntimeStateFindResult,
  applyRuntimeStatePatch,
  clearRuntimeStateFind,
  cloneRuntimeState,
  markRuntimeStateNavigating,
  setRuntimeStateFindQuery,
  setRuntimeStateZoom,
} from "./browser-runtime-state";

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
    const pane = createBrowserPaneRecord({
      createView: this.createView,
      initialUrl,
      kind,
      paneId,
      ...(session ? { session } : {}),
    });

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
    denyPendingPermissionsForPane(this.pendingPermissionResolutions, paneId);
    this.panes.delete(paneId);
    this.pendingHistoryVisits.delete(paneId);
    const webContentsId = pane.view.webContents?.id;
    if (typeof webContentsId === "number") {
      this.paneIdByWebContentsId.delete(webContentsId);
    }

    destroyPaneView(pane);
  }

  showPane(paneId: string): void {
    this.withPane(paneId, (pane) => {
      showPaneView(pane, this.deps);
    });
  }

  hidePane(paneId: string): void {
    this.withPane(paneId, (pane) => {
      hidePaneView(pane, this.deps);
    });
  }

  setVisiblePanes(paneIds: string[]): void {
    syncVisiblePaneViews(this.panes, paneIds, this.deps);
  }

  isPaneVisible(paneId: string): boolean {
    return this.panes.get(paneId)?.isVisible ?? false;
  }

  setBounds(paneId: string, bounds: BrowserBounds): void {
    this.withPane(paneId, (pane) => {
      setPaneBounds(pane, bounds);
    });
  }

  navigate(paneId: string, url: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    markRuntimeStateNavigating(pane.runtimeState);
    this.emitStateChange(pane);

    navigatePaneToUrl(pane, url);
  }

  back(paneId: string): void {
    this.withPane(paneId, (pane) => {
      goBackInPane(pane);
    });
  }

  forward(paneId: string): void {
    this.withPane(paneId, (pane) => {
      goForwardInPane(pane);
    });
  }

  reload(paneId: string): void {
    this.withPane(paneId, (pane) => {
      reloadPane(pane);
    });
  }

  stop(paneId: string): void {
    this.withPane(paneId, (pane) => {
      stopPane(pane);
    });
  }

  focusPane(paneId: string): void {
    this.withPane(paneId, (pane) => {
      focusPaneWebContents(pane);
    });
  }

  setZoom(paneId: string, zoom: number): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    setRuntimeStateZoom(pane.runtimeState, zoom);
    this.emitStateChange(pane);

    setPaneZoomFactor(pane, zoom);
  }

  resetZoom(paneId: string): void {
    this.setZoom(paneId, 1);
  }

  findInPage(paneId: string, query: string, options?: BrowserFindInPageOptions): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    setRuntimeStateFindQuery(pane.runtimeState, query);
    this.emitStateChange(pane);

    startPaneFindInPage(pane, query, options);
  }

  applyFindResult(
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    applyRuntimeStateFindResult(pane.runtimeState, result);
    this.emitStateChange(pane);
  }

  stopFindInPage(paneId: string, action: BrowserStopFindAction = "clearSelection"): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    clearRuntimeStateFind(pane.runtimeState);
    this.emitStateChange(pane);

    stopPaneFindInPage(pane, action);
  }

  toggleDevTools(paneId: string): void {
    this.withPane(paneId, (pane) => {
      togglePaneDevTools(pane);
    });
  }

  showContextMenu(_paneId: string, _position?: { x: number; y: number }): void {
    // Placeholder for later browser context-menu wiring.
  }

  executeScript(paneId: string, script: string): void {
    this.withPane(paneId, (pane) => {
      executePaneScript(pane, script);
    });
  }

  requestPermission(
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ): void {
    requestBrowserPermission(
      this.pendingPermissionResolutions,
      request,
      resolve,
      this.deps.sendToRenderer,
    );
  }

  resolvePermission(requestToken: string, decision: BrowserPermissionDecision): void {
    resolveBrowserPermission(this.pendingPermissionResolutions, requestToken, decision);
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
    const pane = this.getPane(paneId);
    return pane ? cloneRuntimeState(pane.runtimeState) : undefined;
  }

  applyRuntimePatch(paneId: string, patch: BrowserRuntimePatch): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    applyRuntimeStatePatch(pane.runtimeState, patch);
    this.emitStateChange(pane);
  }

  resolvePaneIdForWebContents(webContentsId: number): string | undefined {
    return this.paneIdByWebContentsId.get(webContentsId);
  }

  private emitStateChange(pane: BrowserPaneRecord): void {
    this.deps.sendToRenderer("browser:stateChanged", cloneRuntimeState(pane.runtimeState));
  }

  private getPane(paneId: string): BrowserPaneRecord | undefined {
    return this.panes.get(paneId);
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
        syncPaneNavigationState(nextPane);
      },
      recordCommittedHistoryVisit: (nextPane, url) => {
        recordCommittedHistoryVisit(
          nextPane,
          url,
          this.pendingHistoryVisits,
          this.deps.historyService,
        );
      },
      refreshPendingHistoryTitle: (nextPane, title) => {
        refreshPendingHistoryTitle(
          nextPane,
          title,
          this.pendingHistoryVisits,
          this.deps.historyService,
        );
      },
    });
  }

  private withPane(paneId: string, callback: (pane: BrowserPaneRecord) => void): void {
    const pane = this.getPane(paneId);
    if (!pane) {
      return;
    }

    callback(pane);
  }
}

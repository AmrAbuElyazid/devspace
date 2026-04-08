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
import { cloneRuntimeState, withDerivedSecurityState } from "./browser-runtime-state";

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

    navigatePaneToUrl(pane, url);
  }

  back(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    goBackInPane(pane);
  }

  forward(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    goForwardInPane(pane);
  }

  reload(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    reloadPane(pane);
  }

  stop(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    stopPane(pane);
  }

  focusPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    focusPaneWebContents(pane);
  }

  setZoom(paneId: string, zoom: number): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.runtimeState.currentZoom = zoom;
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

    pane.runtimeState.find = {
      query,
      activeMatch: 0,
      totalMatches: 0,
    };
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

    stopPaneFindInPage(pane, action);
  }

  toggleDevTools(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    togglePaneDevTools(pane);
  }

  showContextMenu(_paneId: string, _position?: { x: number; y: number }): void {
    // Placeholder for later browser context-menu wiring.
  }

  executeScript(paneId: string, script: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    executePaneScript(pane, script);
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

  private syncNavigationState(pane: BrowserPaneRecord): void {
    syncPaneNavigationState(pane);
  }

  private recordCommittedHistoryVisit(pane: BrowserPaneRecord, url: string): void {
    recordCommittedHistoryVisit(pane, url, this.pendingHistoryVisits, this.deps.historyService);
  }

  private refreshPendingHistoryTitle(pane: BrowserPaneRecord, title: string): void {
    refreshPendingHistoryTitle(pane, title, this.pendingHistoryVisits, this.deps.historyService);
  }
}

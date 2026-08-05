import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserFailureState,
  BrowserPermissionRequest,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
  NativePaneFocusReason,
} from "../../shared/browser";
import type {
  BrowserPaneController,
  BrowserPaneKind,
  BrowserPaneManagerDeps,
  BrowserPaneRecord,
  BrowserRuntimePatch,
} from "./browser-types";
import { createBrowserPaneRecord, createElectronView } from "./browser-pane-factory";
import {
  createBrowserPaneHistoryTracker,
  type BrowserPaneHistoryTracker,
} from "./browser-pane-history-tracker";
import { createBrowserPaneRegistry } from "./browser-pane-registry";
import { registerManagedBrowserPaneWebContentsListeners } from "./browser-pane-webcontents-listener-bindings";
import {
  focusPaneWebContents,
  goBackInPane,
  goForwardInPane,
  navigatePaneToUrl,
  reloadPane,
  setPaneZoomFactor,
  stopPane,
} from "./browser-pane-navigation";
import {
  createBrowserPanePermissionTracker,
  type BrowserPanePermissionTracker,
} from "./browser-pane-permissions";
import {
  executePaneScript,
  startPaneFindInPage,
  stopPaneFindInPage,
  togglePaneDevTools,
} from "./browser-pane-webcontents-actions";
import { applyPaneRuntimePatch, reportPaneFailure } from "./browser-pane-runtime-updates";
import {
  destroyPaneView,
  hidePaneView,
  setPaneBounds,
  showPaneView,
  syncVisiblePaneViews,
} from "./browser-pane-view-lifecycle";
import {
  applyRuntimeStateFindResult,
  clearRuntimeStateFind,
  markRuntimeStateNavigating,
  setRuntimeStateFindQuery,
  setRuntimeStateZoom,
} from "./browser-runtime-state";
import {
  INITIAL_BROWSER_CRASH_RECOVERY_STATE,
  planBrowserCrashRecovery,
  type BrowserCrashRecoveryState,
} from "./browser-crash-recovery";
import { measureMainProcessOperation } from "../performance-monitor";

export class BrowserPaneManager implements BrowserPaneController {
  private readonly panes: ReturnType<typeof createBrowserPaneRegistry>;
  private readonly createView: NonNullable<BrowserPaneManagerDeps["createView"]>;
  private readonly historyTracker: BrowserPaneHistoryTracker;
  private readonly permissionTracker: BrowserPanePermissionTracker;
  private visiblePaneIds = new Set<string>();
  private readonly crashRecovery = new Map<string, BrowserCrashRecoveryState>();
  private readonly crashRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: BrowserPaneManagerDeps) {
    this.panes = createBrowserPaneRegistry(deps.sendToRenderer);
    this.createView = deps.createView ?? createElectronView;
    this.historyTracker = createBrowserPaneHistoryTracker(deps.historyService);
    this.permissionTracker = createBrowserPanePermissionTracker(deps.sendToRenderer);
  }

  createPane(paneId: string, initialUrl: string, kind: BrowserPaneKind = "browser"): void {
    measureMainProcessOperation("browser.createPane", () => {
      if (this.panes.has(paneId)) {
        const existingRuntime = this.getRuntimeState(paneId);
        if (existingRuntime?.url !== initialUrl) {
          this.navigate(paneId, initialUrl);
        }
        return;
      }

      const session = this.deps.getSession?.(kind);
      const pane = createBrowserPaneRecord({
        createView: this.createView,
        initialUrl,
        kind,
        paneId,
        ...(session ? { session } : {}),
      });

      this.panes.register(paneId, pane);
      this.registerWebContentsListeners(pane);
      this.navigate(paneId, initialUrl);
    });
  }

  destroyPane(paneId: string): void {
    measureMainProcessOperation("browser.destroyPane", () => {
      const pane = this.panes.get(paneId);
      if (!pane) {
        return;
      }

      hidePaneView(pane, this.deps);
      this.visiblePaneIds.delete(paneId);
      this.permissionTracker.denyPendingForPane(paneId);
      this.historyTracker.deletePane(paneId);
      this.clearCrashRecoveryTimer(paneId);
      this.crashRecovery.delete(paneId);
      this.panes.unregister(paneId);

      destroyPaneView(pane);
    });
  }

  showPane(paneId: string): void {
    measureMainProcessOperation("browser.showPane", () => {
      this.panes.withPane(paneId, (pane) => {
        showPaneView(pane, this.deps);
        this.visiblePaneIds.add(paneId);
      });
    });
  }

  hidePane(paneId: string): void {
    measureMainProcessOperation("browser.hidePane", () => {
      this.panes.withPane(paneId, (pane) => {
        hidePaneView(pane, this.deps);
        this.visiblePaneIds.delete(paneId);
      });
    });
  }

  setVisiblePanes(paneIds: string[]): void {
    measureMainProcessOperation("browser.setVisiblePanes", () => {
      this.visiblePaneIds = syncVisiblePaneViews(
        this.visiblePaneIds,
        this.panes.records(),
        paneIds,
        this.deps,
      );
    });
  }

  isPaneVisible(paneId: string): boolean {
    return this.panes.isVisible(paneId);
  }

  setBounds(paneId: string, bounds: BrowserBounds): void {
    measureMainProcessOperation("browser.setBounds", () => {
      this.panes.withPane(paneId, (pane) => {
        setPaneBounds(pane, bounds);
      });
    });
  }

  navigate(paneId: string, url: string): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      markRuntimeStateNavigating(pane.runtimeState);
      navigatePaneToUrl(pane, url);
    });
  }

  back(paneId: string): void {
    this.panes.withPane(paneId, (pane) => {
      goBackInPane(pane);
    });
  }

  forward(paneId: string): void {
    this.panes.withPane(paneId, (pane) => {
      goForwardInPane(pane);
    });
  }

  reload(paneId: string): void {
    this.panes.withPane(paneId, (pane) => {
      reloadPane(pane);
    });
  }

  stop(paneId: string): void {
    this.panes.withPane(paneId, (pane) => {
      stopPane(pane);
    });
  }

  /**
   * Hand the keyboard to a pane's web contents.
   *
   * `webContents.focus()` is not a pane-local operation on macOS: Electron
   * routes it through the owning window's `Focus(true)`, which activates the
   * app and orders the window front. A pane that came back on screen by itself
   * — a dev server restarting, a view rebuilt after eviction — therefore must
   * not be focused while the user is in another app, or Devspace snatches the
   * screen back from whatever they were doing. The user gets the pane focused
   * anyway the moment they return, via the `window:focus` handler.
   */
  focusPane(paneId: string, reason: NativePaneFocusReason = "user"): void {
    if (reason === "reactive" && this.deps.isWindowFocused?.() === false) {
      return;
    }

    this.panes.withPane(paneId, (pane) => {
      focusPaneWebContents(pane);
    });
  }

  setZoom(paneId: string, zoom: number): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      setRuntimeStateZoom(pane.runtimeState, zoom);
      setPaneZoomFactor(pane, zoom);
    });
  }

  resetZoom(paneId: string): void {
    this.setZoom(paneId, 1);
  }

  findInPage(paneId: string, query: string, options?: BrowserFindInPageOptions): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      setRuntimeStateFindQuery(pane.runtimeState, query);
      startPaneFindInPage(pane, query, options);
    });
  }

  applyFindResult(
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      applyRuntimeStateFindResult(pane.runtimeState, result);
    });
  }

  stopFindInPage(paneId: string, action: BrowserStopFindAction = "clearSelection"): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      clearRuntimeStateFind(pane.runtimeState);
      stopPaneFindInPage(pane, action);
    });
  }

  toggleDevTools(paneId: string): void {
    this.panes.withPane(paneId, (pane) => {
      togglePaneDevTools(pane);
    });
  }

  executeScript(paneId: string, script: string): void {
    this.panes.withPane(paneId, (pane) => {
      executePaneScript(pane, script);
    });
  }

  requestPermission(
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ): void {
    this.permissionTracker.request(request, resolve);
  }

  resolvePermission(requestToken: string, decision: BrowserPermissionDecision): void {
    this.permissionTracker.resolve(requestToken, decision);
  }

  reportFailure(
    paneId: string,
    failure: BrowserFailureState,
    options?: { title?: string; isSecure?: boolean; securityLabel?: string | null },
  ): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      reportPaneFailure(pane, failure, options);
    });
  }

  getRuntimeState(paneId: string): BrowserRuntimeState | undefined {
    return this.panes.getRuntimeState(paneId);
  }

  applyRuntimePatch(paneId: string, patch: BrowserRuntimePatch): void {
    this.panes.withPaneAndStateChange(paneId, (pane) => {
      applyPaneRuntimePatch(pane, patch);
    });
  }

  resolvePaneIdForWebContents(webContentsId: number): string | undefined {
    return this.panes.resolvePaneIdForWebContents(webContentsId);
  }

  private registerWebContentsListeners(pane: BrowserPaneRecord): void {
    registerManagedBrowserPaneWebContentsListeners({
      pane,
      sendToRenderer: this.deps.sendToRenderer,
      getAppShortcutBindings: this.deps.getAppShortcutBindings,
      applyRuntimePatch: this.applyRuntimePatch.bind(this),
      applyFindResult: this.applyFindResult.bind(this),
      historyTracker: this.historyTracker,
      recoverFromCrash: this.recoverFromCrash.bind(this),
    });
  }

  /**
   * Schedule a backoff reload for a pane whose renderer died. Returns false
   * when the retry budget is spent, leaving the caller to report the failure.
   */
  private recoverFromCrash(pane: BrowserPaneRecord): boolean {
    const paneId = pane.runtimeState.paneId;
    const plan = planBrowserCrashRecovery(
      this.crashRecovery.get(paneId) ?? INITIAL_BROWSER_CRASH_RECOVERY_STATE,
      Date.now(),
    );

    if (!plan) {
      return false;
    }

    this.crashRecovery.set(paneId, plan.state);
    this.clearCrashRecoveryTimer(paneId);

    const url = pane.runtimeState.url;
    const timer = setTimeout(() => {
      this.crashRecoveryTimers.delete(paneId);
      // The pane may have been destroyed, or navigated by the user, while the
      // backoff was pending; withPane no-ops if it is gone.
      this.panes.withPane(paneId, (current) => {
        navigatePaneToUrl(current, url);
      });
    }, plan.delayMs);

    // A pending reload must never hold the app open past quit.
    timer.unref?.();
    this.crashRecoveryTimers.set(paneId, timer);
    return true;
  }

  private clearCrashRecoveryTimer(paneId: string): void {
    const pending = this.crashRecoveryTimers.get(paneId);
    if (pending === undefined) {
      return;
    }

    clearTimeout(pending);
    this.crashRecoveryTimers.delete(paneId);
  }
}

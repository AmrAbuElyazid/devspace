import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserContextMenuRequest,
  BrowserContextMenuTarget,
  BrowserFailureState,
  BrowserOpenInNewTabRequest,
  BrowserFindState,
  BrowserPermissionRequest,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from "../../shared/browser";
import type {
  BrowserPaneController,
  BrowserPaneKind,
  BrowserShortcutBinding,
  BrowserPaneManagerDeps,
  BrowserPaneRecord,
  BrowserRuntimePatch,
} from "./browser-types";
import { shortcutsEqual, type ShortcutAction, type StoredShortcut } from "../../shared/shortcuts";

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

function cloneFindState(find: BrowserFindState | null): BrowserFindState | null {
  if (!find) {
    return null;
  }

  return { ...find };
}

function cloneRuntimeState(state: BrowserRuntimeState): BrowserRuntimeState {
  return {
    ...state,
    find: cloneFindState(state.find),
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

function getSecurityState(url: string): Pick<BrowserRuntimeState, "isSecure" | "securityLabel"> {
  const isSecure = url.startsWith("https://");
  return {
    isSecure,
    securityLabel: isSecure ? "Secure" : null,
  };
}

function createInitialRuntimeState(paneId: string, initialUrl: string): BrowserRuntimeState {
  return {
    paneId,
    url: initialUrl,
    title: "Browser",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    ...getSecurityState(initialUrl),
    currentZoom: 1,
    find: null,
    failure: null,
  };
}

function normalizeContextMenuText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getContextMenuTarget(params: {
  linkURL?: unknown;
  selectionText?: unknown;
}): BrowserContextMenuTarget {
  if (normalizeContextMenuText(params.linkURL)) {
    return "link";
  }

  if (normalizeContextMenuText(params.selectionText)) {
    return "selection";
  }

  return "page";
}

type WebContentsEventEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type WebContentsInputEvent = {
  type?: string;
  key?: string;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

const SHIFTED_SYMBOL_KEY_MAP: Record<string, string> = {
  "{": "[",
  "}": "]",
  "+": "=",
  _: "-",
  "<": ",",
  ">": ".",
  "?": "/",
  ":": ";",
  '"': "'",
  "|": "\\",
  "~": "`",
};

const GLOBALLY_OWNED_WEB_SHORTCUT_ACTIONS = new Set<ShortcutAction>([
  "toggle-sidebar",
  "toggle-settings",
  "close-window",
  "new-workspace",
  "close-workspace",
  "rename-workspace",
  "next-workspace",
  "prev-workspace",
  "select-workspace-1",
  "select-workspace-2",
  "select-workspace-3",
  "select-workspace-4",
  "select-workspace-5",
  "select-workspace-6",
  "select-workspace-7",
  "select-workspace-8",
  "select-workspace-9",
  "new-tab",
  "close-tab",
  "next-tab",
  "prev-tab",
  "recent-tab",
  "recent-tab-reverse",
  "select-tab-1",
  "select-tab-2",
  "select-tab-3",
  "select-tab-4",
  "select-tab-5",
  "select-tab-6",
  "select-tab-7",
  "select-tab-8",
  "select-tab-9",
  "rename-tab",
  "split-right",
  "split-down",
  "focus-pane-left",
  "focus-pane-right",
  "focus-pane-up",
  "focus-pane-down",
  "toggle-pane-zoom",
  "terminal-zoom-in",
  "terminal-zoom-out",
  "terminal-zoom-reset",
  "open-browser",
]);

const BROWSER_ONLY_SHORTCUT_ACTIONS = new Set<ShortcutAction>([
  "browser-focus-url",
  "browser-reload",
  "browser-back",
  "browser-forward",
  "browser-find",
  "browser-zoom-in",
  "browser-zoom-out",
  "browser-zoom-reset",
  "browser-devtools",
]);

function getHeldModifier(
  shortcut: Pick<StoredShortcut, "command" | "control">,
): "command" | "control" | null {
  if (shortcut.command) return "command";
  if (shortcut.control) return "control";
  return null;
}

function toStoredShortcut(input: WebContentsInputEvent): StoredShortcut | null {
  if (typeof input.key !== "string") {
    return null;
  }

  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(input.key)) {
    return null;
  }

  const keyMap: Record<string, string> = {
    Enter: "enter",
    Tab: "tab",
    Escape: "escape",
    " ": "space",
    Delete: "delete",
    Backspace: "backspace",
    ArrowUp: "arrowup",
    ArrowDown: "arrowdown",
    ArrowLeft: "arrowleft",
    ArrowRight: "arrowright",
    F1: "f1",
    F2: "f2",
    F3: "f3",
    F4: "f4",
    F5: "f5",
    F6: "f6",
    F7: "f7",
    F8: "f8",
    F9: "f9",
    F10: "f10",
    F11: "f11",
    F12: "f12",
  };

  return {
    key: SHIFTED_SYMBOL_KEY_MAP[input.key] ?? keyMap[input.key] ?? input.key.toLowerCase(),
    command: input.meta === true,
    shift: input.shift === true,
    option: input.alt === true,
    control: input.control === true,
  };
}

function findShortcutBinding(
  bindings: BrowserShortcutBinding[] | undefined,
  kind: BrowserPaneKind,
  shortcut: StoredShortcut,
): BrowserShortcutBinding | undefined {
  return bindings?.find((binding) => {
    if (!shortcutsEqual(binding.shortcut, shortcut)) {
      return false;
    }

    if (GLOBALLY_OWNED_WEB_SHORTCUT_ACTIONS.has(binding.action)) {
      return true;
    }

    return kind === "browser" && BROWSER_ONLY_SHORTCUT_ACTIONS.has(binding.action);
  });
}

type FoundInPageResult = {
  activeMatchOrdinal?: number;
  matches?: number;
};

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
    const view = this.createView(session ? { webPreferences: { session } } : {});
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

    this.hidePane(paneId);
    this.denyPendingPermissionsForPane(paneId);
    this.panes.delete(paneId);
    this.pendingHistoryVisits.delete(paneId);
    const webContentsId = pane.view.webContents?.id;
    if (typeof webContentsId === "number") {
      this.paneIdByWebContentsId.delete(webContentsId);
    }

    const close = (pane.view.webContents as { close?: () => void }).close;
    if (typeof close === "function") {
      close.call(pane.view.webContents);
      return;
    }

    const destroyView = (pane.view as { destroy?: () => void }).destroy;
    if (typeof destroyView === "function") {
      destroyView.call(pane.view);
    }
  }

  showPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || pane.isVisible) {
      return;
    }

    this.deps.addChildView(pane.view);
    if (pane.bounds) {
      const setBounds = pane.view.setBounds;
      if (typeof setBounds === "function") {
        setBounds.call(pane.view, pane.bounds);
      }
    }
    const setZoomFactor = pane.view.webContents?.setZoomFactor;
    if (typeof setZoomFactor === "function") {
      void setZoomFactor.call(pane.view.webContents, pane.runtimeState.currentZoom);
    }
    pane.isVisible = true;
  }

  hidePane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || !pane.isVisible) {
      return;
    }

    this.deps.removeChildView(pane.view);
    pane.isVisible = false;
  }

  setVisiblePanes(paneIds: string[]): void {
    const desiredVisible = new Set(paneIds);

    // Hide panes that should no longer be visible
    for (const [paneId, pane] of this.panes) {
      if (pane.isVisible && !desiredVisible.has(paneId)) {
        this.deps.removeChildView(pane.view);
        pane.isVisible = false;
      }
    }

    // Show panes that should become visible (bounds-first to prevent flash)
    for (const paneId of paneIds) {
      const pane = this.panes.get(paneId);
      if (!pane || pane.isVisible) {
        continue;
      }

      if (pane.bounds) {
        const setBounds = pane.view.setBounds;
        if (typeof setBounds === "function") {
          setBounds.call(pane.view, pane.bounds);
        }
      }
      this.deps.addChildView(pane.view);
      const setZoomFactor = pane.view.webContents?.setZoomFactor;
      if (typeof setZoomFactor === "function") {
        void setZoomFactor.call(pane.view.webContents, pane.runtimeState.currentZoom);
      }
      pane.isVisible = true;
    }
  }

  isPaneVisible(paneId: string): boolean {
    return this.panes.get(paneId)?.isVisible ?? false;
  }

  setBounds(paneId: string, bounds: BrowserBounds): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return;
    }

    pane.bounds = bounds;
    const setBounds = pane.view.setBounds;
    if (typeof setBounds === "function") {
      setBounds.call(pane.view, bounds);
    }
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
      Object.assign(pane.runtimeState, getSecurityState(patch.url));
    }
    this.emitStateChange(pane);
  }

  resolvePaneIdForWebContents(webContentsId: number): string | undefined {
    return this.paneIdByWebContentsId.get(webContentsId);
  }

  private emitStateChange(pane: BrowserPaneRecord): void {
    this.deps.sendToRenderer("browser:stateChanged", cloneRuntimeState(pane.runtimeState));
  }

  private emitContextMenuRequest(payload: BrowserContextMenuRequest): void {
    this.deps.sendToRenderer("browser:contextMenuRequested", payload);
  }

  private emitFocusedPane(paneId: string): void {
    this.deps.sendToRenderer("browser:focused", paneId);
  }

  private emitNativeModifierChanged(modifier: "command" | "control" | null): void {
    this.deps.sendToRenderer("window:nativeModifierChanged", modifier);
  }

  private emitOpenInNewTabRequest(payload: BrowserOpenInNewTabRequest): void {
    this.deps.sendToRenderer("browser:openInNewTabRequested", payload);
  }

  private registerWebContentsListeners(pane: BrowserPaneRecord): void {
    const webContents = pane.view.webContents as Electron.WebContents &
      Partial<WebContentsEventEmitter>;
    const setWindowOpenHandler = (
      webContents as {
        setWindowOpenHandler?: (
          handler: (details: { url: string }) => { action: "deny" | "allow" },
        ) => void;
      }
    ).setWindowOpenHandler;
    if (typeof setWindowOpenHandler === "function") {
      setWindowOpenHandler.call(webContents, (details: { url: string }) => {
        this.emitOpenInNewTabRequest({
          paneId: pane.runtimeState.paneId,
          url: details.url,
        });
        return { action: "deny" };
      });
    }

    if (typeof webContents?.on !== "function") {
      return;
    }

    // Forward WebContentsView console output to main process stdout so
    // diagnostics are visible when launching the .app from terminal.
    // Only forward devspace-prefixed messages — VS Code extensions generate
    // massive amounts of warnings/errors during normal startup (Prisma
    // duplicates, grammar scopes, sandbox notices, etc.).
    webContents.on("console-message", (event: unknown) => {
      // Use new Event object API (positional args are deprecated in Electron 33+).
      const evt = event as { level?: number; message?: string };
      const level = evt.level ?? 0;
      const message = evt.message ?? "";

      if (!message.startsWith("[devspace")) return;

      const prefix = `[webview:${pane.runtimeState.paneId}]`;
      if (level >= 3) console.error(prefix, message);
      else if (level === 2) console.warn(prefix, message);
      else console.log(prefix, message);
    });

    webContents.on("did-start-loading", () => {
      this.applyRuntimePatch(pane.runtimeState.paneId, { isLoading: true, failure: null });
    });

    webContents.on("focus", () => {
      this.emitFocusedPane(pane.runtimeState.paneId);
    });

    webContents.on("blur", () => {
      this.emitNativeModifierChanged(null);
    });

    webContents.on("before-input-event", (event: unknown, input: WebContentsInputEvent) => {
      const setIgnoreMenuShortcuts = (
        webContents as {
          setIgnoreMenuShortcuts?: (ignore: boolean) => void;
        }
      ).setIgnoreMenuShortcuts;

      const shortcut = toStoredShortcut(input);
      this.emitNativeModifierChanged(
        shortcut
          ? getHeldModifier(shortcut)
          : input.meta === true
            ? "command"
            : input.control === true
              ? "control"
              : null,
      );

      if (input.type !== "keyDown" || !shortcut) {
        if (typeof setIgnoreMenuShortcuts === "function") {
          setIgnoreMenuShortcuts.call(
            webContents,
            !(input.meta === true || input.control === true),
          );
        }
        return;
      }

      const binding = findShortcutBinding(
        this.deps.getAppShortcutBindings?.(),
        pane.kind,
        shortcut,
      );
      if (!binding) {
        if (typeof setIgnoreMenuShortcuts === "function") {
          setIgnoreMenuShortcuts.call(
            webContents,
            !(input.meta === true || input.control === true),
          );
        }
        return;
      }

      if (typeof setIgnoreMenuShortcuts === "function") {
        setIgnoreMenuShortcuts.call(webContents, true);
      }

      const preventDefault = (event as { preventDefault?: () => void }).preventDefault;
      if (typeof preventDefault === "function") {
        preventDefault.call(event);
      }

      this.deps.sendToRenderer(binding.channel, ...(binding.args ?? []));
    });

    webContents.on("did-stop-loading", () => {
      this.syncNavigationState(pane);
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        isLoading: false,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
      });
    });

    webContents.on("did-navigate", (_event: unknown, url: string) => {
      this.syncNavigationState(pane);
      this.recordCommittedHistoryVisit(pane, url);
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        url,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
        isLoading: false,
        failure: null,
      });
    });

    webContents.on("did-navigate-in-page", (_event: unknown, url: string) => {
      this.syncNavigationState(pane);
      this.recordCommittedHistoryVisit(pane, url);
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        url,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
        failure: null,
      });
    });

    webContents.on("page-title-updated", (_event: unknown, title: string) => {
      const nextTitle = title || "Browser";
      this.applyRuntimePatch(pane.runtimeState.paneId, { title: nextTitle });
      this.refreshPendingHistoryTitle(pane, nextTitle);
    });

    webContents.on("page-favicon-updated", (_event: unknown, favicons: string[]) => {
      this.applyRuntimePatch(pane.runtimeState.paneId, { faviconUrl: favicons[0] ?? null });
    });

    webContents.on("context-menu", (event: unknown, params: unknown) => {
      const preventDefault = (event as { preventDefault?: () => void })?.preventDefault;
      if (typeof preventDefault === "function") {
        preventDefault.call(event);
      }

      const nextParams =
        typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
      const paneBounds = pane.bounds ?? { x: 0, y: 0 };
      const x = typeof nextParams.x === "number" ? nextParams.x : 0;
      const y = typeof nextParams.y === "number" ? nextParams.y : 0;
      const linkUrl = normalizeContextMenuText(nextParams.linkURL);
      const selectionText = normalizeContextMenuText(nextParams.selectionText);
      const target = getContextMenuTarget(nextParams);

      this.syncNavigationState(pane);
      this.emitContextMenuRequest({
        paneId: pane.runtimeState.paneId,
        position: {
          x: paneBounds.x + x,
          y: paneBounds.y + y,
        },
        target,
        pageUrl: pane.runtimeState.url,
        linkUrl,
        selectionText,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
      });
    });

    webContents.on("found-in-page", (_event: unknown, result: FoundInPageResult) => {
      const query = pane.runtimeState.find?.query;
      if (!query) {
        return;
      }

      this.applyFindResult(pane.runtimeState.paneId, {
        query,
        activeMatch: result.activeMatchOrdinal ?? 0,
        totalMatches: result.matches ?? 0,
      });
    });

    webContents.on(
      "did-fail-load",
      (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame?: boolean,
      ) => {
        if (isMainFrame === false) {
          return;
        }

        if (errorCode === -3) {
          this.applyRuntimePatch(pane.runtimeState.paneId, {
            isLoading: false,
          });
          return;
        }

        const securityPatch =
          errorCode <= -200 && errorCode >= -299
            ? { isSecure: false, securityLabel: "Certificate error" as const }
            : {};

        this.syncNavigationState(pane);
        this.applyRuntimePatch(pane.runtimeState.paneId, {
          title: errorDescription || "Navigation failed",
          faviconUrl: null,
          isLoading: false,
          canGoBack: pane.runtimeState.canGoBack,
          canGoForward: pane.runtimeState.canGoForward,
          failure: {
            kind: "navigation",
            detail: errorDescription || "Navigation failed",
            url: validatedURL,
          },
          ...securityPatch,
        });
      },
    );

    webContents.on("render-process-gone", (_event: unknown, details: { reason?: string }) => {
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        title: "Browser pane crashed",
        faviconUrl: null,
        isLoading: false,
        failure: {
          kind: "crash",
          detail: details.reason ?? "gone",
          url: pane.runtimeState.url,
        },
      });
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

import type {
  BrowserAccessResult,
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserContextMenuRequest,
  BrowserImportMode,
  BrowserImportResult,
  BrowserImportSource,
  BrowserOpenInNewTabRequest,
  BrowserPermissionDecision,
  BrowserPermissionRequest,
  BrowserProfileDescriptor,
  BrowserRuntimeState,
  BrowserStopFindAction,
  ClearBrowsingDataTarget,
} from "./browser";
import type { DevServerPorts } from "./dev-server";
import type { OverlayMenuRequest } from "./overlay";
import type { SidebarPeekConfig, SidebarPeekSnapshot } from "./sidebar-peek";
import type { ShortcutAction, StoredShortcut } from "./shortcuts";
import type { PersistedWorkspacePatch, PersistedWorkspaceState } from "./workspace-persistence";
import type { MainProcessPerformanceSnapshot } from "./performance";

export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TerminalCreateOptions =
  | {
      cwd?: string;
      envVars?: Record<string, string>;
      backend?: "direct";
    }
  | {
      cwd?: string;
      envVars?: Record<string, string>;
      backend: "managed-tmux";
      sessionId: string;
    }
  | {
      cwd?: string;
      envVars?: Record<string, string>;
      backend: "external-tmux";
      sessionName: string;
      socketPath?: string;
    };

export type TerminalCreateResult = { ok: true } | { error: string };
export type TerminalKillSessionResult = { killed: boolean } | { error: string };
export interface ManagedTerminalSession {
  sessionId: string;
  attachedClients: number;
  createdAt: number;
}
export type TerminalListSessionsResult = { sessions: ManagedTerminalSession[] } | { error: string };

export type AppUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export interface AppUpdateState {
  enabled: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  checkedAt: string | null;
  downloadPercent: number | null;
  message: string | null;
  disabledReason: string | null;
}

export type EditorCliStatus =
  | {
      path: string;
      source: "configured-path" | "configured-command" | "bundle" | "path";
    }
  | {
      path: null;
      reason: "configured-not-found" | "not-found";
      attempted?: string;
    };

/**
 * Result of starting an embedded tool pane (editor, T3 Code).
 *
 * `cancelled` is distinct from `error` on purpose: it means a newer start or a
 * stop for the same pane superseded this one while the server was coming up.
 * That is routine, and the pane must not show a failure for it.
 */
export type EmbeddedToolStartResult = { url: string } | { error: string } | { cancelled: true };

export interface DevspaceBridge {
  platform: string;
  app: {
    onAction: (callback: (channel: string, ...args: unknown[]) => void) => () => void;
    getPerformanceSnapshot: () => Promise<MainProcessPerformanceSnapshot>;
    resetPerformanceCounters: () => Promise<void>;
    getUpdateState: () => Promise<AppUpdateState>;
    checkForUpdates: () => Promise<boolean>;
    installUpdate: () => Promise<boolean>;
    onUpdateStateChanged: (callback: (state: AppUpdateState) => void) => () => void;
  };
  terminal: {
    create: (
      surfaceId: string,
      options?: TerminalCreateOptions,
      /**
       * Renderer-side generation for this incarnation of `surfaceId`. Echoed
       * back by `onClosed` so a close event that was already in flight when the
       * surface was replaced can be discarded instead of retiring its
       * successor.
       */
      generation?: number,
    ) => Promise<TerminalCreateResult>;
    destroy: (surfaceId: string) => Promise<void>;
    killManagedSession: (sessionId: string) => Promise<TerminalKillSessionResult>;
    listManagedSessions: () => Promise<TerminalListSessionsResult>;
    show: (surfaceId: string) => Promise<void>;
    hide: (surfaceId: string) => Promise<void>;
    focus: (surfaceId: string) => void;
    setBounds: (surfaceId: string, bounds: TerminalBounds) => void;
    setVisibleSurfaces: (surfaceIds: string[]) => void;
    sendBindingAction: (surfaceId: string, action: string) => Promise<boolean>;
    blur: () => void;
    onTitleChanged: (callback: (surfaceId: string, title: string) => void) => () => void;
    onClosed: (callback: (surfaceId: string, generation: number | null) => void) => () => void;
    onFocused: (callback: (surfaceId: string) => void) => () => void;
    onPwdChanged: (callback: (surfaceId: string, pwd: string) => void) => () => void;
    onSearchStart: (callback: (surfaceId: string, needle: string) => void) => () => void;
    onSearchEnd: (callback: (surfaceId: string) => void) => () => void;
    onSearchTotal: (callback: (surfaceId: string, total: number) => void) => () => void;
    onSearchSelected: (callback: (surfaceId: string, selected: number) => void) => () => void;
    /**
     * Listening TCP ports found under each managed session, whenever the set
     * changes. Sessions with nothing listening are omitted rather than sent
     * with an empty list.
     */
    onDevServerPorts: (callback: (ports: DevServerPorts[]) => void) => () => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    focusContent: () => void;
    /** Reports the height of the bar occupying the top-left, so the native
     *  window buttons can be centered inside it. */
    setTitleBarHeight: (height: number) => void;
    setThemeMode: (themeMode: "system" | "dark" | "light") => void;
    isMaximized: () => Promise<boolean>;
    isFullScreen: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
    onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
    onFocus: (callback: () => void) => () => void;
    onNativeModifierChanged: (
      callback: (modifier: "command" | "control" | null) => void,
    ) => () => void;
    /** Mouse released over a native pane view, where the renderer can't see it. */
    onNativePointerRelease: (callback: () => void) => () => void;
    onOpenEditor: (callback: (folderPath: string) => void) => () => void;
  };
  dialog: {
    openFile: (
      defaultPath?: string,
    ) => Promise<{ path: string; content: string } | { error: string } | null>;
    openFolder: () => Promise<string | null>;
  };
  notes: {
    read: (noteId: string) => Promise<string | null>;
    save: (noteId: string, content: string) => Promise<void | { error: string }>;
    saveSync: (noteId: string, content: string) => void | { error: string };
    list: () => Promise<string[]>;
  };
  shell: {
    openExternal: (url: string) => void;
  };
  overlay: {
    /**
     * Opens a menu in a transparent view stacked above the pane views, so it
     * is visible over live page content. Resolves with the chosen id, or null
     * if dismissed.
     */
    showMenu: (request: OverlayMenuRequest) => Promise<string | null>;
    resolveMenu: (token: number, id: string | null) => void;
    /** Signals that the overlay is mounted and listening. */
    notifyReady: () => void;
    onMenu: (
      callback: (payload: { token: number; request: OverlayMenuRequest }) => void,
    ) => () => void;
  };
  sidebarPeek: {
    /**
     * Tells the main process whether to watch the window's left edge, and what
     * to draw when the cursor reaches it. Sent by the main renderer.
     */
    setConfig: (config: SidebarPeekConfig) => void;
    /** Sent by the overlay renderer when a row in the panel is clicked. */
    activate: (workspaceId: string) => void;
    /** Subscribed by the overlay renderer. Null closes the panel. */
    onPanel: (callback: (snapshot: SidebarPeekSnapshot | null) => void) => () => void;
    /** Subscribed by the main renderer, to switch workspace on a panel click. */
    onActivate: (callback: (workspaceId: string) => void) => () => void;
  };
  contextMenu: {
    show: <T extends string>(
      items: ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  editor: {
    isAvailable: (configuredCli?: string) => Promise<boolean>;
    getCliStatus: (configuredCli?: string) => Promise<EditorCliStatus>;
    start: (
      paneId: string,
      folderPath?: string,
      configuredCli?: string,
    ) => Promise<EmbeddedToolStartResult>;
    stop: (paneId: string) => Promise<void>;
    setKeepServerRunning: (keep: boolean) => void;
  };
  shortcuts: {
    getAll: () => Promise<Record<string, StoredShortcut>>;
    set: (action: ShortcutAction, shortcut: StoredShortcut) => Promise<void>;
    reset: (action: ShortcutAction) => Promise<void>;
    resetAll: () => Promise<void>;
    onChanged: (callback: () => void) => () => void;
  };
  cli: {
    install: () => Promise<{ ok: boolean; error?: string }>;
  };
  workspaceState: {
    load: () => Promise<PersistedWorkspaceState | null>;
    save: (snapshot: PersistedWorkspaceState) => Promise<void>;
    patch: (patch: PersistedWorkspacePatch) => Promise<{ ok: true } | { needsFullSave: true }>;
    saveSync: (snapshot: PersistedWorkspaceState) => void;
  };
  t3code: {
    isAvailable: () => Promise<boolean>;
    start: (paneId: string) => Promise<EmbeddedToolStartResult>;
    stop: (paneId: string) => Promise<void>;
  };
  browser: BrowserBridge;
}

export interface BrowserBridgeListeners {
  onStateChange?: (state: BrowserRuntimeState) => void;
  onFocused?: (paneId: string) => void;
  onPermissionRequest?: (request: BrowserPermissionRequest) => void;
  onContextMenuRequest?: (request: BrowserContextMenuRequest) => void;
  onOpenInNewTabRequest?: (request: BrowserOpenInNewTabRequest) => void;
}

export type BrowserBridgeUnsubscribe = () => void;

export interface BrowserBridge {
  create: (paneId: string, url: string) => Promise<void>;
  destroy: (paneId: string) => Promise<void>;
  show: (paneId: string) => Promise<void>;
  hide: (paneId: string) => Promise<void>;
  setVisiblePanes: (paneIds: string[]) => void;
  getRuntimeState: (paneId: string) => Promise<BrowserRuntimeState | undefined>;
  navigate: (paneId: string, url: string) => Promise<void>;
  back: (paneId: string) => Promise<void>;
  forward: (paneId: string) => Promise<void>;
  reload: (paneId: string) => Promise<void>;
  stop: (paneId: string) => Promise<void>;
  setBounds: (paneId: string, bounds: BrowserBounds) => void;
  setFocus: (paneId: string) => void;
  setZoom: (paneId: string, zoom: number) => Promise<void>;
  resetZoom: (paneId: string) => Promise<void>;
  findInPage: (paneId: string, query: string, options?: BrowserFindInPageOptions) => Promise<void>;
  stopFindInPage: (paneId: string, action?: BrowserStopFindAction) => Promise<void>;
  toggleDevTools: (paneId: string) => Promise<void>;
  /** Fetches a favicon in the main process and returns it as a data URL. */
  resolveFavicon: (url: string) => Promise<string | null>;
  resolvePermission: (requestToken: string, decision: BrowserPermissionDecision) => Promise<void>;
  listProfiles: (browser: BrowserImportSource) => Promise<BrowserProfileDescriptor[]>;
  importBrowser: (
    browser: BrowserImportSource,
    profilePath: string | null,
    mode?: BrowserImportMode,
  ) => Promise<BrowserImportResult>;
  detectAccess: (
    browser: BrowserImportSource,
    mode?: BrowserImportMode,
  ) => Promise<BrowserAccessResult>;
  clearBrowsingData: (target: ClearBrowsingDataTarget) => Promise<{ ok: boolean; error?: string }>;
  getCacheSize: () => Promise<{ bytes: number } | { error: string }>;
  onStateChange: (callback: (state: BrowserRuntimeState) => void) => BrowserBridgeUnsubscribe;
  onFocused: (callback: (paneId: string) => void) => BrowserBridgeUnsubscribe;
  onPermissionRequest: (
    callback: (request: BrowserPermissionRequest) => void,
  ) => BrowserBridgeUnsubscribe;
  onContextMenuRequest: (
    callback: (request: BrowserContextMenuRequest) => void,
  ) => BrowserBridgeUnsubscribe;
  onOpenInNewTabRequest: (
    callback: (request: BrowserOpenInNewTabRequest) => void,
  ) => BrowserBridgeUnsubscribe;
}

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  destructive?: boolean;
  /**
   * Render the entry greyed out and unclickable. Preferred over dropping the
   * entry: a menu whose items move position depending on page state is harder
   * to build muscle memory against than one with a stable shape.
   */
  disabled?: boolean;
  /** Draw a divider above this entry. Ignored on the first entry. */
  separatorBefore?: boolean;
}

declare global {
  interface Window {
    api: DevspaceBridge;
  }
}

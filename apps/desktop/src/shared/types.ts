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
import type { ShortcutAction, StoredShortcut } from "./shortcuts";
import type { PersistedWorkspaceState } from "./workspace-persistence";
import type { MainProcessPerformanceSnapshot } from "./performance";

export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerminalCreateOptions {
  cwd?: string;
  envVars?: Record<string, string>;
}

export type TerminalCreateResult = { ok: true } | { error: string };

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

export interface DevspaceBridge {
  platform: string;
  app: {
    onAction: (callback: (channel: string, ...args: unknown[]) => void) => () => void;
    getPerformanceSnapshot: () => Promise<MainProcessPerformanceSnapshot>;
    resetPerformanceCounters: () => Promise<void>;
  };
  terminal: {
    create: (surfaceId: string, options?: TerminalCreateOptions) => Promise<TerminalCreateResult>;
    destroy: (surfaceId: string) => Promise<void>;
    show: (surfaceId: string) => Promise<void>;
    hide: (surfaceId: string) => Promise<void>;
    focus: (surfaceId: string) => void;
    setBounds: (surfaceId: string, bounds: TerminalBounds) => void;
    setVisibleSurfaces: (surfaceIds: string[]) => void;
    sendBindingAction: (surfaceId: string, action: string) => Promise<boolean>;
    blur: () => void;
    onTitleChanged: (callback: (surfaceId: string, title: string) => void) => () => void;
    onClosed: (callback: (surfaceId: string) => void) => () => void;
    onFocused: (callback: (surfaceId: string) => void) => () => void;
    onPwdChanged: (callback: (surfaceId: string, pwd: string) => void) => () => void;
    onSearchStart: (callback: (surfaceId: string, needle: string) => void) => () => void;
    onSearchEnd: (callback: (surfaceId: string) => void) => () => void;
    onSearchTotal: (callback: (surfaceId: string, total: number) => void) => () => void;
    onSearchSelected: (callback: (surfaceId: string, selected: number) => void) => () => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    focusContent: () => void;
    setSidebarOpen: (open: boolean) => void;
    setThemeMode: (themeMode: "system" | "dark" | "light") => void;
    isMaximized: () => Promise<boolean>;
    isFullScreen: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
    onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
    onFocus: (callback: () => void) => () => void;
    onNativeModifierChanged: (
      callback: (modifier: "command" | "control" | null) => void,
    ) => () => void;
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
    ) => Promise<{ url: string } | { error: string }>;
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
    saveSync: (snapshot: PersistedWorkspaceState) => void;
  };
  t3code: {
    isAvailable: () => Promise<boolean>;
    start: (paneId: string) => Promise<{ url: string } | { error: string }>;
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
  showContextMenu: (paneId: string, position?: { x: number; y: number }) => Promise<void>;
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
}

declare global {
  interface Window {
    api: DevspaceBridge;
  }
}

import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserContextMenuRequest,
  BrowserImportMode,
  BrowserImportResult,
  BrowserOpenInNewTabRequest,
  BrowserPermissionDecision,
  BrowserPermissionRequest,
  BrowserRuntimeState,
  ChromeProfileDescriptor,
  SafariAccessResult,
  BrowserStopFindAction,
} from "./browser";
import type { ShortcutAction, StoredShortcut } from "./shortcuts";

export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerminalCreateOptions {
  cwd?: string;
}

export interface DevspaceBridge {
  platform: string;
  app: {
    onAction: (callback: (channel: string, ...args: unknown[]) => void) => () => void;
  };
  terminal: {
    create: (surfaceId: string, options?: TerminalCreateOptions) => Promise<void>;
    destroy: (surfaceId: string) => Promise<void>;
    show: (surfaceId: string) => Promise<void>;
    hide: (surfaceId: string) => Promise<void>;
    focus: (surfaceId: string) => Promise<void>;
    setBounds: (surfaceId: string, bounds: TerminalBounds) => Promise<void>;
    setVisibleSurfaces: (surfaceIds: string[]) => Promise<void>;
    sendBindingAction: (surfaceId: string, action: string) => Promise<boolean>;
    blur: () => Promise<void>;
    onTitleChanged: (callback: (surfaceId: string, title: string) => void) => () => void;
    onClosed: (callback: (surfaceId: string) => void) => () => void;
    onFocused: (callback: (surfaceId: string) => void) => () => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    setSidebarOpen: (open: boolean) => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
    onFocus: (callback: () => void) => () => void;
    onOpenEditor: (callback: (folderPath: string) => void) => () => void;
  };
  dialog: {
    openFile: (defaultPath?: string) => Promise<{ path: string; content: string } | null>;
    openFolder: () => Promise<string | null>;
  };
  fs: {
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<void>;
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
    isAvailable: () => Promise<boolean>;
    start: (paneId: string, folderPath?: string) => Promise<{ url: string } | { error: string }>;
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
  t3code: {
    isAvailable: () => Promise<boolean>;
    start: (paneId: string) => Promise<{ url: string } | { error: string }>;
    stop: (paneId: string) => Promise<void>;
  };
  browser: BrowserBridge;
}

export interface BrowserBridgeListeners {
  onStateChange?: (state: BrowserRuntimeState) => void;
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
  getRuntimeState: (paneId: string) => Promise<BrowserRuntimeState | undefined>;
  navigate: (paneId: string, url: string) => Promise<void>;
  back: (paneId: string) => Promise<void>;
  forward: (paneId: string) => Promise<void>;
  reload: (paneId: string) => Promise<void>;
  stop: (paneId: string) => Promise<void>;
  setBounds: (paneId: string, bounds: BrowserBounds) => Promise<void>;
  setFocus: (paneId: string) => Promise<void>;
  setZoom: (paneId: string, zoom: number) => Promise<void>;
  resetZoom: (paneId: string) => Promise<void>;
  findInPage: (paneId: string, query: string, options?: BrowserFindInPageOptions) => Promise<void>;
  stopFindInPage: (paneId: string, action?: BrowserStopFindAction) => Promise<void>;
  toggleDevTools: (paneId: string) => Promise<void>;
  showContextMenu: (paneId: string, position?: { x: number; y: number }) => Promise<void>;
  resolvePermission: (requestToken: string, decision: BrowserPermissionDecision) => Promise<void>;
  listChromeProfiles: () => Promise<ChromeProfileDescriptor[]>;
  importChrome: (profilePath: string, mode?: BrowserImportMode) => Promise<BrowserImportResult>;
  importSafari: (mode?: BrowserImportMode) => Promise<BrowserImportResult>;
  detectSafariAccess: (mode?: BrowserImportMode) => Promise<SafariAccessResult>;
  onStateChange: (callback: (state: BrowserRuntimeState) => void) => BrowserBridgeUnsubscribe;
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

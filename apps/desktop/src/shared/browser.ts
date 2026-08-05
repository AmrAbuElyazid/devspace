const KNOWN_BROWSER_PERMISSION_TYPES = [
  "camera",
  "microphone",
  "media",
  "geolocation",
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "hid",
  "idle-detection",
  "mediaKeySystem",
  "midi",
  "midiSysex",
  "openExternal",
  "pointerLock",
  "serial",
  "storage-access",
  "top-level-storage-access",
  "usb",
  "deprecated-sync-clipboard-read",
  "fileSystem",
] as const;

export type BrowserPermissionType = (typeof KNOWN_BROWSER_PERMISSION_TYPES)[number] | (string & {});

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserFindState {
  query: string;
  activeMatch: number;
  totalMatches: number;
}

export interface BrowserFindInPageOptions {
  forward?: boolean;
  findNext?: boolean;
}

export type BrowserStopFindAction = "clearSelection" | "keepSelection" | "activateSelection";

/**
 * Why a native pane was asked for the keyboard.
 *
 * On macOS this is not a detail. Electron's `webContents.focus()` calls
 * `NativeWindow::Focus(true)` for the owning window, which runs
 * `activateIgnoringOtherApps:` and `makeKeyAndOrderFront:` — so focusing a
 * pane activates Devspace and pulls its window in front of whatever the user
 * is actually looking at. (A `WebContentsView` counts: it is given an owner
 * window as soon as it is added to one.)
 *
 * - `user`: the user did something — clicked a tab, submitted the address bar,
 *   pressed a Devspace shortcut. Coming to the front is what they asked for.
 * - `reactive`: the app noticed a pane come back on screen by itself — a dev
 *   server restarting, a view recreated after an eviction, a VS Code pane
 *   finishing its start. Never allowed to activate the app; it is dropped
 *   while the window is not focused, and the pane picks the keyboard back up
 *   from the `window:focus` handler when the user returns on their own.
 */
export type NativePaneFocusReason = "user" | "reactive";
export type BrowserPermissionDecision = "allow-once" | "allow-for-session" | "deny";
export type BrowserContextMenuTarget = "page" | "link" | "selection" | "image";

export interface BrowserFailureState {
  kind: "navigation" | "crash";
  detail: string;
  url: string;
}

export interface BrowserRuntimeState {
  paneId: string;
  url: string;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isSecure: boolean;
  securityLabel: string | null;
  currentZoom: number;
  find: BrowserFindState | null;
  failure: BrowserFailureState | null;
}

export interface BrowserContextMenuRequest {
  paneId: string;
  position: { x: number; y: number };
  target: BrowserContextMenuTarget;
  pageUrl: string;
  linkUrl: string | null;
  imageUrl: string | null;
  selectionText: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserOpenInNewTabRequest {
  paneId: string;
  url: string;
}

export interface BrowserPermissionRequest {
  paneId: string;
  origin: string;
  permissionType: BrowserPermissionType;
  requestToken: string;
}

export type BrowserImportSource = "chrome" | "arc" | "safari" | "zen";

export interface BrowserProfileDescriptor {
  name: string;
  path: string;
  browser: BrowserImportSource;
}

export type BrowserImportMode = "cookies" | "history" | "everything";

export type ClearBrowsingDataTarget = "cookies" | "history" | "cache" | "everything";

export type BrowserImportResult =
  | {
      ok: true;
      importedCookies: number;
      importedHistory: number;
    }
  | {
      ok: false;
      code: string;
      importedCookies: number;
      importedHistory: number;
      message?: string;
      retryable?: boolean;
    };

export type BrowserAccessResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      message: string;
    };

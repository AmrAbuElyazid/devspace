export type BrowserPermissionType = 'camera' | 'microphone' | 'geolocation' | 'notifications'

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserFindState {
  query: string
  activeMatch: number
  totalMatches: number
}

export interface BrowserFindInPageOptions {
  forward?: boolean
  findNext?: boolean
}

export type BrowserStopFindAction = 'clearSelection' | 'keepSelection' | 'activateSelection'
export type BrowserPermissionDecision = 'allow-once' | 'allow-for-session' | 'deny'
export type BrowserContextMenuTarget = 'page' | 'link' | 'selection'

export interface BrowserFailureState {
  kind: 'navigation' | 'crash'
  detail: string
  url: string
}

export interface BrowserRuntimeState {
  paneId: string
  url: string
  title: string
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isSecure: boolean
  securityLabel: string | null
  currentZoom: number
  find: BrowserFindState | null
  failure: BrowserFailureState | null
}

export interface BrowserContextMenuRequest {
  paneId: string
  position: { x: number; y: number }
  target: BrowserContextMenuTarget
  pageUrl: string
  linkUrl: string | null
  selectionText: string | null
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserOpenInNewTabRequest {
  paneId: string
  url: string
}

export interface BrowserPermissionRequest {
  paneId: string
  origin: string
  permissionType: BrowserPermissionType
  requestToken: string
}

export interface ChromeProfileDescriptor {
  name: string
  path: string
}

export type BrowserImportMode = 'cookies' | 'history' | 'everything'

export type BrowserImportResult =
  | {
      ok: true
      importedCookies: number
      importedHistory: number
    }
  | {
      ok: false
      code: string
      importedCookies: number
      importedHistory: number
      message?: string
      retryable?: boolean
    }

export type SafariAccessResult =
  | { ok: true }
  | {
      ok: false
      code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED'
      message: string
    }

export type BrowserPermissionType = 'camera' | 'microphone' | 'geolocation' | 'notifications'

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
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
  find: { query: string; activeMatch: number; totalMatches: number } | null
}

export interface BrowserPermissionRequest {
  paneId: string
  origin: string
  permissionType: BrowserPermissionType
  requestToken: string
}

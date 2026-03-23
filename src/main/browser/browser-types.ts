import type { Session, View, WebContentsView, WebContentsViewConstructorOptions } from 'electron'
import type {
  BrowserBounds,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from '../../shared/browser'

export type BrowserPaneManagerDeps = {
  createView?: (options: WebContentsViewConstructorOptions) => WebContentsView
  addChildView: (view: View) => void
  removeChildView: (view: View) => void
  sendToRenderer: (channel: string, payload: unknown) => void
  getSession?: () => Session
}

export interface BrowserPaneRecord {
  view: WebContentsView
  runtimeState: BrowserRuntimeState
  bounds: BrowserBounds | null
  isVisible: boolean
}

export interface BrowserPaneController {
  createPane(paneId: string, initialUrl: string): void
  destroyPane(paneId: string): void
  showPane(paneId: string): void
  hidePane(paneId: string): void
  getRuntimeState(paneId: string): BrowserRuntimeState | undefined
  navigate(paneId: string, url: string): void
  back(paneId: string): void
  forward(paneId: string): void
  reload(paneId: string): void
  stop(paneId: string): void
  setBounds(paneId: string, bounds: BrowserBounds): void
  focusPane(paneId: string): void
  setZoom(paneId: string, zoom: number): void
  resetZoom(paneId: string): void
  findInPage(paneId: string, query: string): void
  stopFindInPage(paneId: string, action?: BrowserStopFindAction): void
  toggleDevTools(paneId: string): void
  showContextMenu(paneId: string, position?: { x: number; y: number }): void
  resolvePermission(requestToken: string, decision: BrowserPermissionDecision): void
}

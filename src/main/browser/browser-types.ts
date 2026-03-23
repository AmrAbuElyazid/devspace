import type { Session, View, WebContentsView, WebContentsViewConstructorOptions } from 'electron'
import type { BrowserBounds, BrowserRuntimeState } from '../../shared/browser'

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

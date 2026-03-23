import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserPermissionDecision,
  BrowserPermissionRequest,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from './browser'

export interface PtyCreateOptions {
  cols: number
  rows: number
  cwd?: string
  shell?: string
}

export interface DevspaceBridge {
  platform: string
  pty: {
    create: (options: PtyCreateOptions) => Promise<string>
    write: (ptyId: string, data: string) => void
    resize: (ptyId: string, cols: number, rows: number) => void
    destroy: (ptyId: string) => void
    onData: (callback: (ptyId: string, data: string) => void) => () => void
    onExit: (callback: (ptyId: string, exitCode: number) => void) => () => void
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
  }
  dialog: {
    openFile: (defaultPath?: string) => Promise<{ path: string; content: string } | null>
    openFolder: () => Promise<string | null>
  }
  fs: {
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
  }
  shell: {
    openExternal: (url: string) => void
  }
  contextMenu: {
    show: <T extends string>(items: ContextMenuItem<T>[], position?: { x: number; y: number }) => Promise<T | null>
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
    getNativeTheme: () => Promise<'light' | 'dark'>
    onNativeThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void
  }
  browser: BrowserBridge
}

export interface BrowserBridgeListeners {
  onStateChange?: (state: BrowserRuntimeState) => void
  onPermissionRequest?: (request: BrowserPermissionRequest) => void
}

export type BrowserBridgeUnsubscribe = () => void

export interface BrowserBridge {
  create: (paneId: string, url: string) => Promise<void>
  destroy: (paneId: string) => Promise<void>
  show: (paneId: string) => Promise<void>
  hide: (paneId: string) => Promise<void>
  getRuntimeState: (paneId: string) => Promise<BrowserRuntimeState | undefined>
  navigate: (paneId: string, url: string) => Promise<void>
  back: (paneId: string) => Promise<void>
  forward: (paneId: string) => Promise<void>
  reload: (paneId: string) => Promise<void>
  stop: (paneId: string) => Promise<void>
  setBounds: (paneId: string, bounds: BrowserBounds) => Promise<void>
  setFocus: (paneId: string) => Promise<void>
  setZoom: (paneId: string, zoom: number) => Promise<void>
  resetZoom: (paneId: string) => Promise<void>
  findInPage: (paneId: string, query: string, options?: BrowserFindInPageOptions) => Promise<void>
  stopFindInPage: (paneId: string, action?: BrowserStopFindAction) => Promise<void>
  toggleDevTools: (paneId: string) => Promise<void>
  showContextMenu: (paneId: string, position?: { x: number; y: number }) => Promise<void>
  resolvePermission: (requestToken: string, decision: BrowserPermissionDecision) => Promise<void>
  onStateChange: (callback: (state: BrowserRuntimeState) => void) => BrowserBridgeUnsubscribe
  onPermissionRequest: (callback: (request: BrowserPermissionRequest) => void) => BrowserBridgeUnsubscribe
}

export interface ContextMenuItem<T extends string = string> {
  id: T
  label: string
  destructive?: boolean
}

declare global {
  interface Window {
    api: DevspaceBridge
  }
}

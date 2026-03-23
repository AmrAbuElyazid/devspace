import type {
  BrowserBounds,
  BrowserFindState,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from '../../shared/browser'
import type { BrowserPaneManagerDeps, BrowserPaneRecord } from './browser-types'

function createElectronView(options: Electron.WebContentsViewConstructorOptions): Electron.WebContentsView {
  const { WebContentsView } = require('electron') as typeof import('electron')
  return new WebContentsView(options)
}

function cloneFindState(find: BrowserFindState | null): BrowserFindState | null {
  if (!find) {
    return null
  }

  return { ...find }
}

function cloneRuntimeState(state: BrowserRuntimeState): BrowserRuntimeState {
  return {
    ...state,
    find: cloneFindState(state.find),
  }
}

function getSecurityState(url: string): Pick<BrowserRuntimeState, 'isSecure' | 'securityLabel'> {
  const isSecure = url.startsWith('https://')
  return {
    isSecure,
    securityLabel: isSecure ? 'Secure' : null,
  }
}

function createInitialRuntimeState(paneId: string, initialUrl: string): BrowserRuntimeState {
  return {
    paneId,
    url: initialUrl,
    title: 'Browser',
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    ...getSecurityState(initialUrl),
    currentZoom: 1,
    find: null,
  }
}

type WebContentsEventEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

export class BrowserPaneManager {
  private readonly panes = new Map<string, BrowserPaneRecord>()
  private readonly createView: NonNullable<BrowserPaneManagerDeps['createView']>

  constructor(private readonly deps: BrowserPaneManagerDeps) {
    this.createView = deps.createView ?? createElectronView
  }

  createPane(paneId: string, initialUrl: string): void {
    if (this.panes.has(paneId)) {
      return
    }

    const session = this.deps.getSession?.()
    const view = this.createView(session ? { webPreferences: { session } } : {})
    const pane: BrowserPaneRecord = {
      view,
      runtimeState: createInitialRuntimeState(paneId, initialUrl),
      bounds: null,
      isVisible: false,
    }

    this.panes.set(paneId, pane)
    this.registerWebContentsListeners(pane)
    this.navigate(paneId, initialUrl)
    this.emitStateChange(pane)
  }

  destroyPane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    this.hidePane(paneId)
    this.panes.delete(paneId)
  }

  showPane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane || pane.isVisible) {
      return
    }

    this.deps.addChildView(pane.view)
    pane.isVisible = true
  }

  hidePane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane || !pane.isVisible) {
      return
    }

    this.deps.removeChildView(pane.view)
    pane.isVisible = false
  }

  setBounds(paneId: string, bounds: BrowserBounds): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.bounds = bounds
    const setBounds = pane.view.setBounds
    if (typeof setBounds === 'function') {
      setBounds.call(pane.view, bounds)
    }
  }

  navigate(paneId: string, url: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.runtimeState.url = url
    Object.assign(pane.runtimeState, getSecurityState(url))
    this.emitStateChange(pane)

    const loadURL = pane.view.webContents?.loadURL
    if (typeof loadURL === 'function') {
      void loadURL.call(pane.view.webContents, url)
    }
  }

  back(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const goBack = pane?.view.webContents?.goBack
    if (typeof goBack === 'function') {
      goBack.call(pane.view.webContents)
    }
  }

  forward(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const goForward = pane?.view.webContents?.goForward
    if (typeof goForward === 'function') {
      goForward.call(pane.view.webContents)
    }
  }

  reload(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const reload = pane?.view.webContents?.reload
    if (typeof reload === 'function') {
      reload.call(pane.view.webContents)
    }
  }

  stop(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const stop = pane?.view.webContents?.stop
    if (typeof stop === 'function') {
      stop.call(pane.view.webContents)
    }
  }

  focusPane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const focus = pane?.view.webContents?.focus
    if (typeof focus === 'function') {
      focus.call(pane.view.webContents)
    }
  }

  setZoom(paneId: string, zoom: number): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.runtimeState.currentZoom = zoom
    this.emitStateChange(pane)

    const setZoomFactor = pane.view.webContents?.setZoomFactor
    if (typeof setZoomFactor === 'function') {
      void setZoomFactor.call(pane.view.webContents, zoom)
    }
  }

  findInPage(paneId: string, query: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.runtimeState.find = {
      query,
      activeMatch: 0,
      totalMatches: 0,
    }
    this.emitStateChange(pane)

    const findInPage = pane.view.webContents?.findInPage
    if (typeof findInPage === 'function') {
      void findInPage.call(pane.view.webContents, query)
    }
  }

  stopFindInPage(paneId: string, action: BrowserStopFindAction = 'clearSelection'): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.runtimeState.find = null
    this.emitStateChange(pane)

    const stopFindInPage = pane.view.webContents?.stopFindInPage
    if (typeof stopFindInPage === 'function') {
      stopFindInPage.call(pane.view.webContents, action)
    }
  }

  getRuntimeState(paneId: string): BrowserRuntimeState | undefined {
    const pane = this.panes.get(paneId)
    return pane ? cloneRuntimeState(pane.runtimeState) : undefined
  }

  private emitStateChange(pane: BrowserPaneRecord): void {
    this.deps.sendToRenderer('browser:stateChange', cloneRuntimeState(pane.runtimeState))
  }

  private registerWebContentsListeners(pane: BrowserPaneRecord): void {
    const webContents = pane.view.webContents as Electron.WebContents & Partial<WebContentsEventEmitter>
    if (typeof webContents?.on !== 'function') {
      return
    }

    webContents.on('did-start-loading', () => {
      pane.runtimeState.isLoading = true
      this.emitStateChange(pane)
    })

    webContents.on('did-stop-loading', () => {
      pane.runtimeState.isLoading = false
      this.syncNavigationState(pane)
      this.emitStateChange(pane)
    })

    webContents.on('did-navigate', (_event: unknown, url: string) => {
      pane.runtimeState.url = url
      Object.assign(pane.runtimeState, getSecurityState(url))
      this.syncNavigationState(pane)
      this.emitStateChange(pane)
    })

    webContents.on('did-navigate-in-page', (_event: unknown, url: string) => {
      pane.runtimeState.url = url
      Object.assign(pane.runtimeState, getSecurityState(url))
      this.syncNavigationState(pane)
      this.emitStateChange(pane)
    })

    webContents.on('page-title-updated', (_event: unknown, title: string) => {
      pane.runtimeState.title = title || 'Browser'
      this.emitStateChange(pane)
    })

    webContents.on('page-favicon-updated', (_event: unknown, favicons: string[]) => {
      pane.runtimeState.faviconUrl = favicons[0] ?? null
      this.emitStateChange(pane)
    })
  }

  private syncNavigationState(pane: BrowserPaneRecord): void {
    const canGoBack = pane.view.webContents?.canGoBack
    const canGoForward = pane.view.webContents?.canGoForward

    pane.runtimeState.canGoBack = typeof canGoBack === 'function'
      ? canGoBack.call(pane.view.webContents)
      : false
    pane.runtimeState.canGoForward = typeof canGoForward === 'function'
      ? canGoForward.call(pane.view.webContents)
      : false
  }
}

import type {
  BrowserFindInPageOptions,
  BrowserBounds,
  BrowserContextMenuRequest,
  BrowserContextMenuTarget,
  BrowserOpenInNewTabRequest,
  BrowserFindState,
  BrowserPermissionDecision,
  BrowserRuntimeState,
  BrowserStopFindAction,
} from '../../shared/browser'
import type { BrowserPaneController, BrowserPaneManagerDeps, BrowserPaneRecord, BrowserRuntimePatch } from './browser-types'

type PendingHistoryVisit = {
  url: string
  visitedAt: number
}

type WebContentsNavigationHistory = {
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  goBack?: () => void
  goForward?: () => void
}

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

function getNavigationHistory(webContents: Electron.WebContents | undefined): WebContentsNavigationHistory | null {
  const navigationHistory = (webContents as (Electron.WebContents & {
    navigationHistory?: WebContentsNavigationHistory
  }) | undefined)?.navigationHistory

  return navigationHistory ?? null
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

function normalizeContextMenuText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getContextMenuTarget(params: { linkURL?: unknown; selectionText?: unknown }): BrowserContextMenuTarget {
  if (normalizeContextMenuText(params.linkURL)) {
    return 'link'
  }

  if (normalizeContextMenuText(params.selectionText)) {
    return 'selection'
  }

  return 'page'
}

type WebContentsEventEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

type FoundInPageResult = {
  activeMatchOrdinal?: number
  matches?: number
}

export class BrowserPaneManager implements BrowserPaneController {
  private readonly panes = new Map<string, BrowserPaneRecord>()
  private readonly paneIdByWebContentsId = new Map<number, string>()
  private readonly pendingHistoryVisits = new Map<string, PendingHistoryVisit>()
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
    const webContentsId = pane.view.webContents?.id
    if (typeof webContentsId === 'number') {
      this.paneIdByWebContentsId.set(webContentsId, paneId)
    }
    this.registerWebContentsListeners(pane)
    this.navigate(paneId, initialUrl)
  }

  destroyPane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    this.hidePane(paneId)
    this.panes.delete(paneId)
    this.pendingHistoryVisits.delete(paneId)
    const webContentsId = pane.view.webContents?.id
    if (typeof webContentsId === 'number') {
      this.paneIdByWebContentsId.delete(webContentsId)
    }

    const close = (pane.view.webContents as { close?: () => void }).close
    if (typeof close === 'function') {
      close.call(pane.view.webContents)
      return
    }

    const destroyView = (pane.view as { destroy?: () => void }).destroy
    if (typeof destroyView === 'function') {
      destroyView.call(pane.view)
    }
  }

  showPane(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane || pane.isVisible) {
      return
    }

    this.deps.addChildView(pane.view)
    if (pane.bounds) {
      const setBounds = pane.view.setBounds
      if (typeof setBounds === 'function') {
        setBounds.call(pane.view, pane.bounds)
      }
    }
    const setZoomFactor = pane.view.webContents?.setZoomFactor
    if (typeof setZoomFactor === 'function') {
      void setZoomFactor.call(pane.view.webContents, pane.runtimeState.currentZoom)
    }
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

  isPaneVisible(paneId: string): boolean {
    return this.panes.get(paneId)?.isVisible ?? false
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

    pane.runtimeState.isLoading = true
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

    const navigationHistory = getNavigationHistory(pane.view.webContents)
    const goBack = navigationHistory?.goBack ?? pane?.view.webContents?.goBack
    if (typeof goBack === 'function') {
      goBack.call(navigationHistory ?? pane.view.webContents)
    }
  }

  forward(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const navigationHistory = getNavigationHistory(pane.view.webContents)
    const goForward = navigationHistory?.goForward ?? pane?.view.webContents?.goForward
    if (typeof goForward === 'function') {
      goForward.call(navigationHistory ?? pane.view.webContents)
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

  resetZoom(paneId: string): void {
    this.setZoom(paneId, 1)
  }

  findInPage(paneId: string, query: string, options?: BrowserFindInPageOptions): void {
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
      void findInPage.call(pane.view.webContents, query, options)
    }
  }

  applyFindResult(paneId: string, result: { query: string; activeMatch: number; totalMatches: number }): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    pane.runtimeState.find = {
      query: result.query,
      activeMatch: result.activeMatch,
      totalMatches: result.totalMatches,
    }
    this.emitStateChange(pane)
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

  toggleDevTools(paneId: string): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    const isOpened = pane.view.webContents?.isDevToolsOpened
    const openDevTools = pane.view.webContents?.openDevTools
    const closeDevTools = pane.view.webContents?.closeDevTools
    if (typeof isOpened === 'function' && isOpened.call(pane.view.webContents)) {
      if (typeof closeDevTools === 'function') {
        closeDevTools.call(pane.view.webContents)
      }
      return
    }

    if (typeof openDevTools === 'function') {
      openDevTools.call(pane.view.webContents)
    }
  }

  showContextMenu(_paneId: string, _position?: { x: number; y: number }): void {
    // Placeholder for later browser context-menu wiring.
  }

  resolvePermission(_requestToken: string, _decision: BrowserPermissionDecision): void {
    // Placeholder for later permission-response wiring.
  }

  getRuntimeState(paneId: string): BrowserRuntimeState | undefined {
    const pane = this.panes.get(paneId)
    return pane ? cloneRuntimeState(pane.runtimeState) : undefined
  }

  applyRuntimePatch(paneId: string, patch: BrowserRuntimePatch): void {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return
    }

    Object.assign(pane.runtimeState, patch)
    const hasExplicitSecurityState = patch.isSecure !== undefined || patch.securityLabel !== undefined
    if (patch.url !== undefined && !hasExplicitSecurityState) {
      Object.assign(pane.runtimeState, getSecurityState(patch.url))
    }
    this.emitStateChange(pane)
  }

  resolvePaneIdForWebContents(webContentsId: number): string | undefined {
    return this.paneIdByWebContentsId.get(webContentsId)
  }

  private emitStateChange(pane: BrowserPaneRecord): void {
    this.deps.sendToRenderer('browser:stateChanged', cloneRuntimeState(pane.runtimeState))
  }

  private emitContextMenuRequest(payload: BrowserContextMenuRequest): void {
    this.deps.sendToRenderer('browser:contextMenuRequested', payload)
  }

  private emitOpenInNewTabRequest(payload: BrowserOpenInNewTabRequest): void {
    this.deps.sendToRenderer('browser:openInNewTabRequested', payload)
  }

  private registerWebContentsListeners(pane: BrowserPaneRecord): void {
    const webContents = pane.view.webContents as Electron.WebContents & Partial<WebContentsEventEmitter>
    const setWindowOpenHandler = (webContents as {
      setWindowOpenHandler?: (
        handler: (details: { url: string }) => { action: 'deny' | 'allow' },
      ) => void
    }).setWindowOpenHandler
    if (typeof setWindowOpenHandler === 'function') {
      setWindowOpenHandler.call(webContents, (details: { url: string }) => {
        this.emitOpenInNewTabRequest({
          paneId: pane.runtimeState.paneId,
          url: details.url,
        })
        return { action: 'deny' }
      })
    }

    if (typeof webContents?.on !== 'function') {
      return
    }

    webContents.on('did-start-loading', () => {
      this.applyRuntimePatch(pane.runtimeState.paneId, { isLoading: true })
    })

    webContents.on('did-stop-loading', () => {
      this.syncNavigationState(pane)
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        isLoading: false,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
      })
    })

    webContents.on('did-navigate', (_event: unknown, url: string) => {
      this.syncNavigationState(pane)
      this.recordCommittedHistoryVisit(pane, url)
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        url,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
        isLoading: false,
      })
    })

    webContents.on('did-navigate-in-page', (_event: unknown, url: string) => {
      this.syncNavigationState(pane)
      this.recordCommittedHistoryVisit(pane, url)
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        url,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
      })
    })

    webContents.on('page-title-updated', (_event: unknown, title: string) => {
      const nextTitle = title || 'Browser'
      this.applyRuntimePatch(pane.runtimeState.paneId, { title: nextTitle })
      this.refreshPendingHistoryTitle(pane, nextTitle)
    })

    webContents.on('page-favicon-updated', (_event: unknown, favicons: string[]) => {
      this.applyRuntimePatch(pane.runtimeState.paneId, { faviconUrl: favicons[0] ?? null })
    })

    webContents.on('context-menu', (event: unknown, params: unknown) => {
      const preventDefault = (event as { preventDefault?: () => void })?.preventDefault
      if (typeof preventDefault === 'function') {
        preventDefault.call(event)
      }

      const nextParams = (typeof params === 'object' && params !== null)
        ? params as Record<string, unknown>
        : {}
      const paneBounds = pane.bounds ?? { x: 0, y: 0 }
      const x = typeof nextParams.x === 'number' ? nextParams.x : 0
      const y = typeof nextParams.y === 'number' ? nextParams.y : 0
      const linkUrl = normalizeContextMenuText(nextParams.linkURL)
      const selectionText = normalizeContextMenuText(nextParams.selectionText)
      const target = getContextMenuTarget(nextParams)

      this.syncNavigationState(pane)
      this.emitContextMenuRequest({
        paneId: pane.runtimeState.paneId,
        position: {
          x: paneBounds.x + x,
          y: paneBounds.y + y,
        },
        target,
        pageUrl: pane.runtimeState.url,
        linkUrl,
        selectionText,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
      })
    })

    webContents.on('found-in-page', (_event: unknown, result: FoundInPageResult) => {
      const query = pane.runtimeState.find?.query
      if (!query) {
        return
      }

      this.applyFindResult(pane.runtimeState.paneId, {
        query,
        activeMatch: result.activeMatchOrdinal ?? 0,
        totalMatches: result.matches ?? 0,
      })
    })

    webContents.on('did-fail-load', (_event: unknown, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame?: boolean) => {
      if (isMainFrame === false) {
        return
      }

      const securityPatch = errorCode <= -200 && errorCode >= -299
        ? { isSecure: false, securityLabel: 'Certificate error' as const }
        : {}

      this.syncNavigationState(pane)
      this.applyRuntimePatch(pane.runtimeState.paneId, {
        title: errorDescription || 'Navigation failed',
        faviconUrl: null,
        isLoading: false,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
        ...securityPatch,
      })
    })
  }

  private syncNavigationState(pane: BrowserPaneRecord): void {
    const navigationHistory = getNavigationHistory(pane.view.webContents)
    const canGoBack = navigationHistory?.canGoBack ?? pane.view.webContents?.canGoBack
    const canGoForward = navigationHistory?.canGoForward ?? pane.view.webContents?.canGoForward

    pane.runtimeState.canGoBack = typeof canGoBack === 'function'
      ? canGoBack.call(navigationHistory ?? pane.view.webContents)
      : false
    pane.runtimeState.canGoForward = typeof canGoForward === 'function'
      ? canGoForward.call(navigationHistory ?? pane.view.webContents)
      : false
  }

  private recordCommittedHistoryVisit(pane: BrowserPaneRecord, url: string): void {
    const pendingVisit = {
      url,
      visitedAt: Date.now(),
    }

    this.pendingHistoryVisits.set(pane.runtimeState.paneId, pendingVisit)
    this.deps.historyService?.recordVisit({
      url,
      title: url,
      visitedAt: pendingVisit.visitedAt,
      source: 'devspace',
    })
  }

  private refreshPendingHistoryTitle(pane: BrowserPaneRecord, title: string): void {
    const pendingVisit = this.pendingHistoryVisits.get(pane.runtimeState.paneId)
    if (!pendingVisit || pendingVisit.url !== pane.runtimeState.url) {
      return
    }

    this.deps.historyService?.recordVisit({
      url: pendingVisit.url,
      title,
      visitedAt: pendingVisit.visitedAt,
      source: 'devspace',
    })
  }
}

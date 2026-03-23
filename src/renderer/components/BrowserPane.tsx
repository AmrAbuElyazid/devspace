import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Search } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import type { BrowserConfig } from '../types/workspace'

interface BrowserPaneProps {
  paneId: string
  config: BrowserConfig
}

function normalizeUrl(input: string): string {
  let url = input.trim()
  if (!url) return 'about:blank'
  // If it looks like a domain (has a dot, no spaces)
  if (!url.includes('://') && url.includes('.') && !url.includes(' ')) {
    url = 'https://' + url
  }
  // If it doesn't look like a URL at all, search with Google
  if (!url.includes('://') && !url.includes('.')) {
    url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
  }
  return url
}

export default function BrowserPane({ paneId, config }: BrowserPaneProps): React.JSX.Element {
  const initialUrl = config.url || 'about:blank'
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const webviewRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initedRef = useRef(false)

  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle)

  const getWebview = useCallback((): Electron.WebviewTag | null => {
    return webviewRef.current as unknown as Electron.WebviewTag | null
  }, [])

  const updateNavState = useCallback(() => {
    const wv = getWebview()
    if (!wv) return
    try {
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    } catch {
      // webview may not be ready
    }
  }, [getWebview])

  // Set up webview event listeners after DOM is ready
  useEffect(() => {
    if (initedRef.current) return
    const container = containerRef.current
    if (!container) return

    // Create webview element imperatively to have full control over attributes
    const wv = document.createElement('webview') as unknown as Electron.WebviewTag
    wv.setAttribute('src', normalizeUrl(initialUrl))
    wv.setAttribute('style', 'width: 100%; height: 100%;')
    // Security: no node integration, no preload, no popups
    wv.setAttribute('allowpopups', 'false')

    container.appendChild(wv as unknown as Node)
    ;(webviewRef as React.MutableRefObject<HTMLElement | null>).current = wv as unknown as HTMLElement

    initedRef.current = true

    const handleDidNavigate = (e: Electron.DidNavigateEvent): void => {
      setCurrentUrl(e.url)
      setInputUrl(e.url)
      updatePaneConfig(paneId, { url: e.url })
      updateNavState()
    }

    const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      setCurrentUrl(e.url)
      setInputUrl(e.url)
      updatePaneConfig(paneId, { url: e.url })
      updateNavState()
    }

    const handleStartLoading = (): void => {
      setIsLoading(true)
    }

    const handleStopLoading = (): void => {
      setIsLoading(false)
      updateNavState()
    }

    const handleTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      updatePaneTitle(paneId, e.title)
    }

    const handleNewWindow = (e: Electron.NewWindowEvent): void => {
      // Load new windows in the same webview
      const webview = getWebview()
      if (webview) {
        webview.loadURL((e as unknown as { url: string }).url)
      }
    }

    // Wait for dom-ready before attaching navigation-dependent listeners
    const handleDomReady = (): void => {
      updateNavState()
    }

    wv.addEventListener('did-navigate', handleDidNavigate as unknown as EventListener)
    wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage as unknown as EventListener)
    wv.addEventListener('did-start-loading', handleStartLoading)
    wv.addEventListener('did-stop-loading', handleStopLoading)
    wv.addEventListener('page-title-updated', handleTitleUpdated as unknown as EventListener)
    wv.addEventListener('new-window', handleNewWindow as unknown as EventListener)
    wv.addEventListener('dom-ready', handleDomReady)

    return () => {
      wv.removeEventListener('did-navigate', handleDidNavigate as unknown as EventListener)
      wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage as unknown as EventListener)
      wv.removeEventListener('did-start-loading', handleStartLoading)
      wv.removeEventListener('did-stop-loading', handleStopLoading)
      wv.removeEventListener('page-title-updated', handleTitleUpdated as unknown as EventListener)
      wv.removeEventListener('new-window', handleNewWindow as unknown as EventListener)
      wv.removeEventListener('dom-ready', handleDomReady)

      if (container.contains(wv as unknown as Node)) {
        container.removeChild(wv as unknown as Node)
      }
      ;(webviewRef as React.MutableRefObject<HTMLElement | null>).current = null
      initedRef.current = false
    }
  }, [paneId, initialUrl, getWebview, updateNavState, updatePaneConfig, updatePaneTitle])

  const handleNavigate = useCallback(
    (url: string) => {
      const normalized = normalizeUrl(url)
      setInputUrl(normalized)
      setCurrentUrl(normalized)
      const wv = getWebview()
      if (wv) {
        wv.loadURL(normalized)
      }
    },
    [getWebview],
  )

  const handleBack = useCallback(() => {
    const wv = getWebview()
    if (wv && wv.canGoBack()) {
      wv.goBack()
    }
  }, [getWebview])

  const handleForward = useCallback(() => {
    const wv = getWebview()
    if (wv && wv.canGoForward()) {
      wv.goForward()
    }
  }, [getWebview])

  const handleReloadOrStop = useCallback(() => {
    const wv = getWebview()
    if (!wv) return
    if (isLoading) {
      wv.stop()
    } else {
      wv.reload()
    }
  }, [getWebview, isLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleNavigate(inputUrl)
        inputRef.current?.blur()
      } else if (e.key === 'Escape') {
        setInputUrl(currentUrl)
        inputRef.current?.blur()
      }
    },
    [inputUrl, currentUrl, handleNavigate],
  )

  const handleBlur = useCallback(() => {
    // Revert to current URL if user didn't press Enter
    setInputUrl(currentUrl)
  }, [currentUrl])

  const handleFocus = useCallback(() => {
    // Select all text on focus for easy replacement
    inputRef.current?.select()
  }, [])

  const navButtonStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    padding: 0,
  }

  const disabledStyle: React.CSSProperties = {
    ...navButtonStyle,
    opacity: 0.3,
    cursor: 'default',
  }

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 shrink-0 px-1"
        style={{
          height: 36,
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Back */}
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
          style={canGoBack ? navButtonStyle : disabledStyle}
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Forward */}
        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
          style={canGoForward ? navButtonStyle : disabledStyle}
          title="Forward"
        >
          <ArrowRight size={16} />
        </button>

        {/* Reload / Stop */}
        <button
          onClick={handleReloadOrStop}
          className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
          style={navButtonStyle}
          title={isLoading ? 'Stop' : 'Reload'}
        >
          {isLoading ? <X size={16} /> : <RotateCw size={14} />}
        </button>

        {/* URL Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className="flex-1 min-w-0 rounded px-2 text-xs outline-none"
          style={{
            height: 26,
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            fontFamily: "'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
            fontSize: 11,
          }}
          placeholder="Enter URL or search..."
        />

        {/* Go / Search */}
        <button
          onClick={() => handleNavigate(inputUrl)}
          className="flex items-center justify-center rounded hover:bg-[var(--accent)]"
          style={navButtonStyle}
          title="Go"
        >
          <Search size={14} />
        </button>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            height: 2,
            backgroundColor: 'var(--primary)',
            animation: 'browser-loading 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Webview container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Loading animation keyframes */}
      <style>{`
        @keyframes browser-loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}

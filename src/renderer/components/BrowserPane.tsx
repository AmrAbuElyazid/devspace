import { useEffect, useMemo, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Search, X } from 'lucide-react'
import { normalizeBrowserInput } from '../lib/browser-url'
import { useBrowserBounds } from '../hooks/useBrowserBounds'
import { useBrowserStore } from '../store/browser-store'
import { useWorkspaceStore } from '../store/workspace-store'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import type { BrowserConfig } from '../types/workspace'
import type { ReactElement } from 'react'

interface BrowserPaneProps {
  paneId: string
  config: BrowserConfig
  isVisible: boolean
  hideNativeView: boolean
}

export default function BrowserPane({
  paneId,
  config,
  isVisible,
  hideNativeView,
}: BrowserPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const runtimeState = useBrowserStore((s) => s.runtimeByPaneId[paneId])
  const isPaneCreated = useBrowserStore((s) => s.createdPaneIds[paneId] === true)
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle)
  const initialUrl = useMemo(() => normalizeBrowserInput(config.url || 'about:blank'), [config.url])
  const [inputUrl, setInputUrl] = useState(initialUrl)

  useBrowserBounds({
    paneId,
    enabled: isVisible && !hideNativeView,
    ref: placeholderRef,
  })

  useEffect(() => {
    let cancelled = false

    if (isPaneCreated) {
      return () => {
        cancelled = true
      }
    }

    useBrowserStore.getState().markPaneCreated(paneId)
    void window.api.browser.create(paneId, initialUrl).catch(() => {
      if (!cancelled) {
        useBrowserStore.getState().markPaneDestroyed(paneId)
      }
    })

    return () => {
      cancelled = true
    }
  }, [initialUrl, isPaneCreated, paneId])

  useEffect(() => {
    if (runtimeState?.url) {
      setInputUrl(runtimeState.url)
      updatePaneConfig(paneId, { url: runtimeState.url })
    }
  }, [paneId, runtimeState?.url, updatePaneConfig])

  useEffect(() => {
    if (runtimeState?.title) {
      updatePaneTitle(paneId, runtimeState.title)
    }
  }, [paneId, runtimeState?.title, updatePaneTitle])

  useEffect(() => {
    const nextVisible = isVisible && !hideNativeView
    const action = nextVisible ? window.api.browser.show : window.api.browser.hide
    void action(paneId)
  }, [hideNativeView, isVisible, paneId])

  const currentUrl = runtimeState?.url ?? initialUrl
  const isLoading = runtimeState?.isLoading ?? false
  const canGoBack = runtimeState?.canGoBack ?? false
  const canGoForward = runtimeState?.canGoForward ?? false

  const handleNavigate = useCallback((value: string) => {
    const normalized = normalizeBrowserInput(value)
    setInputUrl(normalized)
    void window.api.browser.navigate(paneId, normalized)
  }, [paneId])

  const handleReloadOrStop = useCallback(() => {
    if (isLoading) {
      void window.api.browser.stop(paneId)
      return
    }

    void window.api.browser.reload(paneId)
  }, [isLoading, paneId])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleNavigate(inputUrl)
      inputRef.current?.blur()
      return
    }

    if (event.key === 'Escape') {
      setInputUrl(currentUrl)
      inputRef.current?.blur()
    }
  }, [currentUrl, handleNavigate, inputUrl])

  return (
    <div className="browser-pane-shell">
      <div className="browser-toolbar flex items-center gap-1 shrink-0 px-1">
        <Tooltip content="Back" shortcut="⌘[">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.back(paneId)}
            disabled={!canGoBack}
            className="browser-nav-btn"
          >
            <ArrowLeft size={16} />
          </Button>
        </Tooltip>

        <Tooltip content="Forward" shortcut="⌘]">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.forward(paneId)}
            disabled={!canGoForward}
            className="browser-nav-btn"
          >
            <ArrowRight size={16} />
          </Button>
        </Tooltip>

        <Tooltip content={isLoading ? 'Stop' : 'Reload'} shortcut="⌘R">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReloadOrStop}
            className="browser-nav-btn"
          >
            {isLoading ? <X size={16} /> : <RotateCw size={14} />}
          </Button>
        </Tooltip>

        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setInputUrl(currentUrl)}
          onFocus={() => inputRef.current?.select()}
          className="browser-url-input flex-1 min-w-0 rounded px-2 text-xs outline-none"
          placeholder="Enter URL or search..."
        />

        <Tooltip content="Go">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleNavigate(inputUrl)}
            className="browser-nav-btn"
          >
            <Search size={14} />
          </Button>
        </Tooltip>
      </div>

      {isLoading && <div className="browser-loading-bar" />}

      <div className="browser-shell-viewport">
        <div
          ref={placeholderRef}
          className="browser-native-view-slot"
          data-native-view-hidden={!isVisible || hideNativeView ? 'true' : undefined}
        />
      </div>
    </div>
  )
}

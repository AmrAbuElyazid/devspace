import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useBrowserBounds } from '../hooks/useBrowserBounds'
import { Button } from './ui/button'
import type { ReactElement } from 'react'

// Module-level tracking to survive React remounts (same pattern as EditorPane)
const startedInstances = new Set<string>()

/** Call when a T3 Code pane is destroyed externally. */
export function markT3CodeDestroyed(paneId: string): void {
  startedInstances.delete(paneId)
}

interface T3CodePaneProps {
  paneId: string
  isVisible: boolean
  hideNativeView: boolean
}

type T3CodeState =
  | { status: 'starting' }
  | { status: 'running' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }

export default function T3CodePane({
  paneId,
  isVisible,
  hideNativeView,
}: T3CodePaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const shouldShowNativeView = isVisible && !hideNativeView

  const [state, setState] = useState<T3CodeState>(() => {
    if (startedInstances.has(paneId)) {
      return { status: 'running' }
    }
    return { status: 'starting' }
  })

  // Track bounds for the WebContentsView
  useBrowserBounds({
    paneId,
    enabled: shouldShowNativeView && state.status === 'running',
    ref: placeholderRef,
  })

  // Start the T3 Code server immediately on mount
  useEffect(() => {
    if (state.status !== 'starting') return
    if (startedInstances.has(paneId)) {
      setState({ status: 'running' })
      return
    }

    let cancelled = false

    void (async () => {
      // Check availability first
      const available = await window.api.t3code.isAvailable()
      if (cancelled) return
      if (!available) {
        setState({ status: 'unavailable' })
        return
      }

      const result = await window.api.t3code.start(paneId)
      if (cancelled) return

      if ('error' in result) {
        setState({ status: 'error', message: result.error })
        return
      }

      startedInstances.add(paneId)
      setState({ status: 'running' })
    })()

    return () => { cancelled = true }
  }, [paneId, state.status])

  // Show/hide the WebContentsView based on visibility
  useEffect(() => {
    if (state.status !== 'running') return
    const action = shouldShowNativeView
      ? window.api.browser.show
      : window.api.browser.hide
    void action(paneId)
  }, [shouldShowNativeView, paneId, state.status])

  const handleRetry = useCallback(() => {
    setState({ status: 'starting' })
  }, [])

  if (state.status === 'unavailable') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--background)' }}>
        <AlertCircle size={48} style={{ color: 'var(--destructive)', opacity: 0.6 }} />
        <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>
          T3 Code CLI not found. Install it with{' '}
          <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface)' }}>
            npm install -g t3
          </code>
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--background)' }}>
        <AlertCircle size={48} style={{ color: 'var(--destructive)', opacity: 0.6 }} />
        <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>
          {state.message}
        </p>
        <Button onClick={handleRetry}>Retry</Button>
      </div>
    )
  }

  if (state.status === 'starting') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--background)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Starting T3 Code...
        </p>
      </div>
    )
  }

  // Running state — native view placeholder
  return (
    <div
      ref={placeholderRef}
      className="browser-native-view-slot"
      data-native-view-hidden={!shouldShowNativeView ? 'true' : undefined}
    />
  )
}

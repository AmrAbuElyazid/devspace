import { useEffect, useRef, useState, useCallback } from 'react'
import { FolderOpen, AlertCircle, Loader2 } from 'lucide-react'
import { useBrowserBounds } from '../hooks/useBrowserBounds'
import { useWorkspaceStore } from '../store/workspace-store'
import { Button } from './ui/button'
import type { EditorConfig } from '../types/workspace'
import type { ReactElement } from 'react'

// Module-level tracking to survive React remounts (same pattern as TerminalPane)
const startedEditors = new Set<string>()

/** Call when an editor pane is destroyed externally. */
export function markEditorDestroyed(paneId: string): void {
  startedEditors.delete(paneId)
}

interface EditorPaneProps {
  paneId: string
  config: EditorConfig
  isVisible: boolean
  hideNativeView: boolean
}

type EditorState =
  | { status: 'picking-folder' }
  | { status: 'starting'; folderPath: string }
  | { status: 'running'; folderPath: string }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }

export default function EditorPane({
  paneId,
  config,
  isVisible,
  hideNativeView,
}: EditorPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle)

  const shouldShowNativeView = isVisible && !hideNativeView

  // Determine initial state based on config
  const [state, setState] = useState<EditorState>(() => {
    if (startedEditors.has(paneId)) {
      return { status: 'running', folderPath: config.folderPath || '' }
    }
    if (config.folderPath) {
      return { status: 'starting', folderPath: config.folderPath }
    }
    return { status: 'picking-folder' }
  })

  // Track bounds for the WebContentsView (reuses browser bounds hook)
  useBrowserBounds({
    paneId,
    enabled: shouldShowNativeView && state.status === 'running',
    ref: placeholderRef,
  })

  // Start the VS Code server when we have a folder
  useEffect(() => {
    if (state.status !== 'starting') return
    if (startedEditors.has(paneId)) {
      setState({ status: 'running', folderPath: state.folderPath })
      return
    }

    let cancelled = false

    void (async () => {
      const result = await window.api.editor.start(paneId, state.folderPath)

      if (cancelled) return

      if ('error' in result) {
        setState({ status: 'error', message: result.error })
        return
      }

      startedEditors.add(paneId)
      const folderName = state.folderPath.split('/').pop() || state.folderPath
      updatePaneTitle(paneId, `VS Code: ${folderName}`)
      updatePaneConfig(paneId, { folderPath: state.folderPath })
      setState({ status: 'running', folderPath: state.folderPath })
    })()

    return () => { cancelled = true }
  }, [paneId, state, updatePaneConfig, updatePaneTitle])

  // Show/hide the WebContentsView based on visibility
  useEffect(() => {
    if (state.status !== 'running') return
    const action = shouldShowNativeView
      ? window.api.browser.show
      : window.api.browser.hide
    void action(paneId)
  }, [shouldShowNativeView, paneId, state.status])

  // Check availability on mount
  useEffect(() => {
    if (state.status !== 'picking-folder') return
    void window.api.editor.isAvailable().then((available) => {
      if (!available) {
        setState({ status: 'unavailable' })
      }
    })
  }, [state.status])

  // Folder picker
  const handlePickFolder = useCallback(async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    setState({ status: 'starting', folderPath: folder })
  }, [])

  // Retry on error
  const handleRetry = useCallback(() => {
    if (config.folderPath) {
      setState({ status: 'starting', folderPath: config.folderPath })
    } else {
      setState({ status: 'picking-folder' })
    }
  }, [config.folderPath])

  // Render states before the VS Code view is ready
  if (state.status === 'unavailable') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--background)' }}>
        <AlertCircle size={48} style={{ color: 'var(--destructive)', opacity: 0.6 }} />
        <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>
          VS Code CLI not found. Install <strong>Visual Studio Code</strong> and
          run <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface)' }}>
          Shell Command: Install &apos;code&apos; command in PATH</code> from
          the VS Code command palette.
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

  if (state.status === 'picking-folder') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--background)' }}>
        <FolderOpen size={48} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Open a folder to start editing
        </p>
        <Button onClick={handlePickFolder}>
          <FolderOpen size={14} />
          Open Folder
        </Button>
      </div>
    )
  }

  if (state.status === 'starting') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--background)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Starting VS Code server...
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

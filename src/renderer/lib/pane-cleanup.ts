import type { Pane } from '../types/workspace'
import { markSurfaceDestroyed } from '../components/TerminalPane'
import { markEditorDestroyed } from '../components/EditorPane'

export type PaneCleanupDeps = {
  destroyTerminal: (surfaceId: string) => void
  destroyBrowser: (paneId: string) => void
  destroyEditor: (paneId: string) => void
  clearBrowserRuntime: (paneId: string) => void
}

export function cleanupPaneResources(
  panes: Record<string, Pane>,
  paneId: string,
  deps: PaneCleanupDeps,
): void {
  const pane = panes[paneId]

  if (pane?.type === 'terminal') {
    markSurfaceDestroyed(paneId)
    deps.destroyTerminal(paneId)
  }

  if (pane?.type === 'browser') {
    deps.destroyBrowser(paneId)
    deps.clearBrowserRuntime(paneId)
  }

  if (pane?.type === 'editor') {
    markEditorDestroyed(paneId)
    deps.destroyEditor(paneId)
  }
}

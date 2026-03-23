import type { Pane, TerminalConfig } from '../types/workspace'

export type PaneCleanupDeps = {
  destroyPty: (ptyId: string) => void
  destroyBrowser: (paneId: string) => void
  clearBrowserRuntime: (paneId: string) => void
}

export function cleanupPaneResources(
  panes: Record<string, Pane>,
  paneId: string,
  deps: PaneCleanupDeps,
): void {
  const pane = panes[paneId]
  const terminalConfig = pane?.type === 'terminal' ? pane.config as TerminalConfig : null

  if (terminalConfig?.ptyId) {
    deps.destroyPty(terminalConfig.ptyId)
  }

  if (pane?.type === 'browser') {
    deps.destroyBrowser(paneId)
    deps.clearBrowserRuntime(paneId)
  }
}

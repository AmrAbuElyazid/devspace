import type { Workspace } from '../types/workspace'
import { collectPaneIds } from '../store/workspace-store'

export function findWorkspaceIdForPane(workspaces: Workspace[], paneId: string): string | null {
  for (const workspace of workspaces) {
    for (const tab of workspace.tabs) {
      if (collectPaneIds(tab.root).includes(paneId)) {
        return workspace.id
      }
    }
  }

  return null
}

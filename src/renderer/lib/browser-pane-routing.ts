import type { Workspace, PaneGroup, SplitNode } from '../types/workspace'
import { collectGroupIds } from '../store/workspace-store'

export function findWorkspaceIdForPane(
  workspaces: Workspace[],
  paneId: string,
  paneGroups: Record<string, PaneGroup>,
): string | null {
  for (const workspace of workspaces) {
    const groupIds = collectGroupIds(workspace.root)
    for (const groupId of groupIds) {
      const group = paneGroups[groupId]
      if (group?.tabs.some((t) => t.paneId === paneId)) {
        return workspace.id
      }
    }
  }

  return null
}

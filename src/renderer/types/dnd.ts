export type DragItemData =
  | { type: 'sidebar-workspace'; workspaceId: string }
  | { type: 'sidebar-folder'; folderId: string }
  | { type: 'group-tab'; workspaceId: string; groupId: string; tabId: string }

export type DropSide = 'left' | 'right' | 'top' | 'bottom'

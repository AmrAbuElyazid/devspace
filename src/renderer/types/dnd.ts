export type DragItemData =
  | { type: 'sidebar-workspace'; workspaceId: string }
  | { type: 'sidebar-folder'; folderId: string }
  | { type: 'tab'; workspaceId: string; tabId: string }

export type DropSide = 'left' | 'right' | 'top' | 'bottom'

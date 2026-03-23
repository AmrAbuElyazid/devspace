export type DragItemData =
  | { type: 'sidebar-workspace'; workspaceId: string }
  | { type: 'sidebar-folder'; folderId: string }
  | { type: 'tab'; workspaceId: string; tabId: string }

export type DropSide = 'left' | 'right' | 'top' | 'bottom'

export type DropTargetData =
  | { type: 'sidebar-sortable'; parentFolderId: string | null; index: number }
  | { type: 'sidebar-folder'; folderId: string }
  | { type: 'sidebar-workspace-target'; workspaceId: string }
  | { type: 'pane-zone'; workspaceId: string; tabId: string; paneId: string; side: DropSide }
  | { type: 'tab-sortable'; workspaceId: string; tabId: string }

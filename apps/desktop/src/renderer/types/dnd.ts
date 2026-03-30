export type SidebarContainer = "main" | "pinned";

export type DragItemData =
  | {
      type: "sidebar-workspace";
      workspaceId: string;
      container: SidebarContainer;
      parentFolderId: string | null;
    }
  | {
      type: "sidebar-folder";
      folderId: string;
      container: SidebarContainer;
      parentFolderId: string | null;
    }
  | { type: "group-tab"; workspaceId: string; groupId: string; tabId: string };

export type DropSide = "left" | "right" | "top" | "bottom";

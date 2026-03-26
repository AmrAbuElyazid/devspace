import type { DragItemData, SidebarContainer } from "../types/dnd";

type SidebarDragData = Extract<DragItemData, { type: "sidebar-workspace" | "sidebar-folder" }>;

type SidebarDropTarget =
  | {
      type: "sidebar-folder";
      folderId: string;
      container: SidebarContainer;
      parentFolderId: string | null;
    }
  | {
      type: "sidebar-workspace";
      workspaceId: string;
      container: SidebarContainer;
      parentFolderId: string | null;
    }
  | { type: "sidebar-root"; container: SidebarContainer };

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ResolveSidebarDropInput {
  active: SidebarDragData;
  over: SidebarDropTarget;
  pointer: { x: number; y: number };
  rects?: Record<string, RectLike>;
  siblingIds?: Partial<Record<SidebarContainer, string[]>>;
  folderChildCounts?: Record<string, number>;
  rootCounts?: Partial<Record<SidebarContainer, number>>;
}

interface SidebarDropResolution {
  targetContainer: SidebarContainer;
  targetParentId: string | null;
  targetIndex: number;
}

function isInsertAfter(pointer: { x: number; y: number }, rect: RectLike): boolean {
  return (pointer.y - rect.top) / rect.height > 0.5;
}

function isFolderCenterZone(pointer: { x: number; y: number }, rect: RectLike): boolean {
  const relY = (pointer.y - rect.top) / rect.height;
  return relY >= 0.25 && relY <= 0.75;
}

export function resolveSidebarDrop(input: ResolveSidebarDropInput): SidebarDropResolution | null {
  const { over, pointer } = input;

  if (over.type === "sidebar-root") {
    return {
      targetContainer: over.container,
      targetParentId: null,
      targetIndex: input.rootCounts?.[over.container] ?? 0,
    };
  }

  if (over.type === "sidebar-folder") {
    const rect =
      input.rects?.[`folder-${over.folderId}`] ?? input.rects?.[`folder-folder-${over.folderId}`];
    if (!rect) return null;

    if (isFolderCenterZone(pointer, rect)) {
      return {
        targetContainer: over.container,
        targetParentId: over.folderId,
        targetIndex: input.folderChildCounts?.[over.folderId] ?? 0,
      };
    }

    const siblings = input.siblingIds?.[over.container] ?? [];
    const overIndex = siblings.indexOf(over.folderId);
    const insertAfter = isInsertAfter(pointer, rect);

    return {
      targetContainer: over.container,
      targetParentId: over.parentFolderId,
      targetIndex: overIndex === -1 ? siblings.length : insertAfter ? overIndex + 1 : overIndex,
    };
  }

  const rect =
    input.rects?.[`ws-${over.workspaceId}`] ?? input.rects?.[`workspace-${over.workspaceId}`];
  if (!rect) return null;

  const siblings = input.siblingIds?.[over.container] ?? [];
  const overIndex = siblings.indexOf(over.workspaceId);
  const insertAfter = isInsertAfter(pointer, rect);

  return {
    targetContainer: over.container,
    targetParentId: over.parentFolderId,
    targetIndex: overIndex === -1 ? siblings.length : insertAfter ? overIndex + 1 : overIndex,
  };
}

import type { CollisionDescriptor } from "@dnd-kit/core";
import type { DragItemData, DropSide, SidebarContainer } from "../../types/dnd";
import type { useWorkspaceStore } from "../../store/workspace-store";

// Re-export for convenience
export type { DragItemData, DropSide, SidebarContainer };

/**
 * Unified drop intent — describes what should happen when a drag ends.
 * Each handler resolves to one of these variants.
 */
export type DropIntent =
  // Handler 1: Sidebar reorder / move between folders/containers
  | {
      kind: "reorder-sidebar";
      nodeId: string;
      nodeType: "workspace" | "folder";
      sourceContainer: SidebarContainer;
      targetContainer: SidebarContainer;
      targetParentId: string | null;
      targetIndex: number;
    }
  // Handler 2: Tab reorder within/between groups (always same workspace)
  | {
      kind: "reorder-tab";
      workspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetGroupId: string;
      targetTabId: string;
    }
  // Handler 3: Tab split pane
  | {
      kind: "split-group";
      workspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetGroupId: string;
      side: DropSide;
    }
  // Handler 4: Tab to existing workspace
  | {
      kind: "move-to-workspace";
      sourceWorkspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetWorkspaceId: string;
    }
  // Handler 5 (NEW): Workspace merge into group
  | {
      kind: "merge-workspace";
      sourceWorkspaceId: string;
      targetGroupId: string;
    }
  // Handler 5 (NEW): Workspace split into active area
  | {
      kind: "split-with-workspace";
      sourceWorkspaceId: string;
      targetGroupId: string;
      side: DropSide;
    }
  // Handler 6 (NEW): Tab creates new workspace in sidebar
  | {
      kind: "create-workspace-from-tab";
      sourceWorkspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetContainer: SidebarContainer;
      targetParentFolderId: string | null;
      targetIndex: number;
    };

/**
 * Context provided to handlers during intent resolution.
 */
export interface ResolveContext {
  drag: DragItemData;
  collisions: CollisionDescriptor[];
  pointer: { x: number; y: number };
  store: typeof useWorkspaceStore;
}

/**
 * Each handler encapsulates one logical drag-drop interaction.
 */
export interface DndHandler {
  /** Unique identifier for this handler */
  id: string;

  /** Does this handler apply to this drag item? */
  canHandle(drag: DragItemData): boolean;

  /** Is this droppable target valid for collision filtering? */
  isValidTarget(drag: DragItemData, targetData: Record<string, unknown>): boolean;

  /** Resolve the drop intent from collision/pointer data. Return null to delegate. */
  resolveIntent(ctx: ResolveContext): DropIntent | null;

  /** Execute the resolved intent. Return true if handled, false to delegate. */
  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean;
}

import { useState, useCallback, useRef, createContext, useContext } from "react";
import {
  useSensors,
  useSensor,
  PointerSensor,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type CollisionDescriptor,
  pointerWithin,
  closestCenter,
} from "@dnd-kit/core";
import { useWorkspaceStore } from "../store/workspace-store";
import { findFolder } from "../lib/sidebar-tree";
import { filterCollisionsForActiveDrag } from "../lib/dnd-collision-filter";
import { resolveSidebarDrop } from "../lib/sidebar-drop-resolution";
import {
  resolveTabDropIntent,
  type TabDropIntent,
  type TabDropTarget,
} from "../lib/tab-dnd-intent";
import type { DragItemData, SidebarContainer } from "../types/dnd";
import type { SidebarNode } from "../types/workspace";

// React context to share activeDrag state without prop drilling
export const DragContext = createContext<{
  activeDrag: DragItemData | null;
  dropIntent: TabDropIntent | null;
}>({ activeDrag: null, dropIntent: null });
export const useDragContext = () => useContext(DragContext);

function getPointerPosition(event: {
  activatorEvent: Event;
  delta: { x: number; y: number };
}): { x: number; y: number } | null {
  if (!(event.activatorEvent instanceof PointerEvent)) return null;

  return {
    x: event.activatorEvent.clientX + event.delta.x,
    y: event.activatorEvent.clientY + event.delta.y,
  };
}

function collisionToDropTarget(collision: CollisionDescriptor): TabDropTarget | null {
  const data = collision.data?.droppableContainer?.data?.current as
    | Record<string, unknown>
    | undefined;
  const rect = collision.data?.droppableContainer?.rect.current;
  if (!data || !rect) return null;

  const visible = data.visible !== false;
  const targetRect = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };

  switch (data.type) {
    case "group-tab":
      return {
        kind: "group-tab",
        workspaceId: data.workspaceId as string,
        groupId: data.groupId as string,
        tabId: data.tabId as string,
        visible,
        rect: targetRect,
      };
    case "pane-drop":
      return {
        kind: "pane-drop",
        workspaceId: data.workspaceId as string,
        groupId: data.groupId as string,
        visible,
        rect: targetRect,
      };
    case "sidebar-workspace":
      return {
        kind: "sidebar-workspace",
        workspaceId: data.workspaceId as string,
        visible,
        rect: targetRect,
      };
    case "sidebar-folder":
      return {
        kind: "sidebar-folder",
        folderId: data.folderId as string,
        visible,
        rect: targetRect,
      };
    default:
      return null;
  }
}

export function useDragAndDrop() {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
  const [dropIntent, setDropIntent] = useState<TabDropIntent | null>(null);
  const folderExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredFolderIdRef = useRef<string | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  const store = useWorkspaceStore;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // Collision detection: pointerWithin-first, then closestCenter as fallback.
  //
  // pointerWithin only matches droppable rects that CONTAIN the pointer.
  // This means:
  //   - Tab sortable items match only when pointer is over the tab bar
  //   - Pane zones match only when pointer is over the pane area
  //   - Sidebar items match only when pointer is over the sidebar
  // No filtering needed — geometry does the scoping naturally.
  //
  // closestCenter fallback handles the case where pointer is between
  // sortable items (not inside any rect but close enough for reorder).
  // Collision detection: pointerWithin for all targets, closestCenter fallback
  // for sortable items only. pane-drop zones use strict containment — they
  // ONLY match when the pointer is physically inside the drop zone.
  // closestCenter must never return pane-drop zones, otherwise dragging between
  // tabs (where pointer isn't inside any tab rect) would match a drop zone
  // by proximity and trigger an unintended split.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        return filterCollisionsForActiveDrag(
          activeDrag,
          pointerCollisions as CollisionDescriptor[],
        );
      }
      // closestCenter fallback — EXCLUDE pane-drop zones. Drop zones require
      // strict pointer containment (pointerWithin), not proximity.
      const centerCollisions = closestCenter(args);
      return filterCollisionsForActiveDrag(
        activeDrag,
        centerCollisions.filter(
          (c) =>
            (c.data?.droppableContainer?.data?.current as Record<string, unknown>)?.type !==
            "pane-drop",
        ) as CollisionDescriptor[],
      );
    },
    [activeDrag],
  );

  const clearFolderExpandTimer = useCallback(() => {
    if (folderExpandTimerRef.current) {
      clearTimeout(folderExpandTimerRef.current);
      folderExpandTimerRef.current = null;
    }
    hoveredFolderIdRef.current = null;
  }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragItemData;
    setActiveDrag(data);
    setDropIntent(null);
  }, []);

  const onDragMove = useCallback((event: DragMoveEvent) => {
    const dragData = event.active.data.current as DragItemData;
    const pointer = getPointerPosition(event);
    pointerPosRef.current = pointer;

    if (!dragData || dragData.type !== "group-tab") {
      setDropIntent(null);
      return;
    }

    if (!pointer) {
      setDropIntent(null);
      return;
    }

    const targets = (event.collisions ?? [])
      .map((collision) => collisionToDropTarget(collision as CollisionDescriptor))
      .filter((target): target is TabDropTarget => target !== null);

    setDropIntent(
      resolveTabDropIntent({
        active: {
          workspaceId: dragData.workspaceId,
          groupId: dragData.groupId,
          tabId: dragData.tabId,
        },
        pointer,
        overTargets: targets,
      }),
    );
  }, []);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event;
      if (!over) {
        clearFolderExpandTimer();
        return;
      }

      const overData = over.data.current as Record<string, unknown> | undefined;
      if (!overData) return;

      // Folder auto-expand on 500ms hover
      if (overData.type === "sidebar-folder") {
        const folderId = overData.folderId as string;
        if (hoveredFolderIdRef.current !== folderId) {
          clearFolderExpandTimer();
          hoveredFolderIdRef.current = folderId;
          folderExpandTimerRef.current = setTimeout(() => {
            store.getState().expandFolder(folderId);
          }, 500);
        }
      } else {
        clearFolderExpandTimer();
      }
    },
    [clearFolderExpandTimer, store],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);
      clearFolderExpandTimer();
      const currentDropIntent = dropIntent;
      const pointerPos = pointerPosRef.current;
      pointerPosRef.current = null;
      setDropIntent(null);

      if (!over) return;

      const dragData = active.data.current as DragItemData;
      const dropData = over.data.current as Record<string, unknown> | undefined;
      if (!dragData || !dropData) return;
      const dropType = dropData.type as string;

      const state = store.getState();

      // ── Sidebar item → Sidebar item (reorder / move between levels / drop into folder) ──
      const isSidebarDrag =
        dragData.type === "sidebar-workspace" || dragData.type === "sidebar-folder";
      const isSidebarDrop =
        dropType === "sidebar-workspace" ||
        dropType === "sidebar-folder" ||
        dropType === "sidebar-root";

      if (isSidebarDrag && isSidebarDrop && pointerPos) {
        const nodeId =
          dragData.type === "sidebar-workspace" ? dragData.workspaceId : dragData.folderId;
        const nodeType = dragData.type === "sidebar-workspace" ? "workspace" : "folder";

        const sourceContainer = dragData.container;
        const makeSiblings = (nodes: SidebarNode[], parentFolderId: string | null): string[] => {
          const siblings =
            parentFolderId === null ? nodes : (findFolder(nodes, parentFolderId)?.children ?? []);
          return siblings.map((child) =>
            child.type === "workspace" ? child.workspaceId : child.id,
          );
        };

        const mainNodes = state.sidebarTree as SidebarNode[];
        const pinnedNodes = (state.pinnedSidebarNodes ?? []) as SidebarNode[];
        const targetContainer =
          (dropData.container as SidebarContainer | undefined) ??
          (dragData.container as SidebarContainer);
        const targetNodes = targetContainer === "main" ? mainNodes : pinnedNodes;

        const rects =
          dropType === "sidebar-folder"
            ? {
                [`folder-${dropData.folderId as string}`]: over.rect as DOMRect,
              }
            : dropType === "sidebar-workspace"
              ? {
                  [`ws-${dropData.workspaceId as string}`]: over.rect as DOMRect,
                }
              : undefined;

        const resolution = resolveSidebarDrop({
          active: dragData,
          over:
            dropType === "sidebar-root"
              ? { type: "sidebar-root", container: targetContainer }
              : dropType === "sidebar-folder"
                ? {
                    type: "sidebar-folder",
                    folderId: dropData.folderId as string,
                    container: targetContainer,
                    parentFolderId: (dropData.parentFolderId as string | null) ?? null,
                  }
                : {
                    type: "sidebar-workspace",
                    workspaceId: dropData.workspaceId as string,
                    container: targetContainer,
                    parentFolderId: (dropData.parentFolderId as string | null) ?? null,
                  },
          pointer: pointerPos,
          ...(rects ? { rects } : {}),
          siblingIds: {
            main:
              dropType === "sidebar-root"
                ? makeSiblings(mainNodes, null)
                : makeSiblings(mainNodes, (dropData.parentFolderId as string | null) ?? null),
            pinned:
              dropType === "sidebar-root"
                ? makeSiblings(pinnedNodes, null)
                : makeSiblings(pinnedNodes, (dropData.parentFolderId as string | null) ?? null),
          },
          ...(dropType === "sidebar-folder"
            ? {
                folderChildCounts: {
                  [dropData.folderId as string]:
                    findFolder(targetNodes, dropData.folderId as string)?.children.length ?? 0,
                },
              }
            : {}),
          rootCounts: {
            main: mainNodes.length,
            pinned: pinnedNodes.length,
          },
        });

        if (!resolution) return;
        if (dropType === "sidebar-folder" && resolution.targetParentId === dropData.folderId) {
          state.expandFolder(dropData.folderId as string);
        }

        state.moveSidebarNode({
          nodeId,
          nodeType,
          sourceContainer,
          targetContainer: resolution.targetContainer,
          targetParentId: resolution.targetParentId,
          targetIndex: resolution.targetIndex,
        });
        return;
      }

      // ── group-tab → group-tab ──
      if (dragData.type === "group-tab" && dropType === "group-tab") {
        const srcGroupId = dragData.groupId;
        const destGroupId = dropData.groupId as string;
        const srcTabId = dragData.tabId;
        const destTabId = dropData.tabId as string;

        if (srcGroupId === destGroupId) {
          // Intra-group reorder
          const group = state.paneGroups[srcGroupId];
          if (!group) return;
          const fromIndex = group.tabs.findIndex((t) => t.id === srcTabId);
          const toIndex = group.tabs.findIndex((t) => t.id === destTabId);
          if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
          state.reorderGroupTabs(dragData.workspaceId, srcGroupId, fromIndex, toIndex);
        } else {
          // Cross-group move — insert at position of target tab
          const destGroup = state.paneGroups[destGroupId];
          if (!destGroup) return;
          const insertIndex = destGroup.tabs.findIndex((t) => t.id === destTabId);
          state.moveTabToGroup(
            dragData.workspaceId,
            srcGroupId,
            srcTabId,
            destGroupId,
            insertIndex !== -1 ? insertIndex : undefined,
          );
        }
        return;
      }

      if (dragData.type === "group-tab" && currentDropIntent) {
        if (currentDropIntent.kind === "split-group") {
          state.splitGroupWithTab(
            currentDropIntent.workspaceId,
            currentDropIntent.sourceGroupId,
            currentDropIntent.sourceTabId,
            currentDropIntent.targetGroupId,
            currentDropIntent.side,
          );
          return;
        }

        if (currentDropIntent.kind === "move-to-workspace") {
          state.moveTabToWorkspace(
            currentDropIntent.sourceWorkspaceId,
            currentDropIntent.sourceGroupId,
            currentDropIntent.sourceTabId,
            currentDropIntent.targetWorkspaceId,
          );
          return;
        }

        if (currentDropIntent.kind === "move-to-group-tab") {
          const srcGroupId = currentDropIntent.sourceGroupId;
          const destGroupId = currentDropIntent.targetGroupId;
          const srcTabId = currentDropIntent.sourceTabId;
          const destTabId = currentDropIntent.targetTabId;

          if (srcGroupId === destGroupId) {
            const group = state.paneGroups[srcGroupId];
            if (!group) return;
            const fromIndex = group.tabs.findIndex((t) => t.id === srcTabId);
            const toIndex = group.tabs.findIndex((t) => t.id === destTabId);
            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
            state.reorderGroupTabs(dragData.workspaceId, srcGroupId, fromIndex, toIndex);
          } else {
            const destGroup = state.paneGroups[destGroupId];
            if (!destGroup) return;
            const insertIndex = destGroup.tabs.findIndex((t) => t.id === destTabId);
            state.moveTabToGroup(
              dragData.workspaceId,
              srcGroupId,
              srcTabId,
              destGroupId,
              insertIndex !== -1 ? insertIndex : undefined,
            );
          }
          return;
        }
      }

      // ── group-tab → sidebar-workspace (cross-workspace move) ──
      if (dragData.type === "group-tab" && dropType === "sidebar-workspace") {
        const destWorkspaceId = dropData.workspaceId as string;
        if (dragData.workspaceId === destWorkspaceId) return;
        state.moveTabToWorkspace(
          dragData.workspaceId,
          dragData.groupId,
          dragData.tabId,
          destWorkspaceId,
        );
        return;
      }
    },
    [clearFolderExpandTimer, dropIntent, store],
  );

  const onDragCancel = useCallback(() => {
    setActiveDrag(null);
    setDropIntent(null);
    pointerPosRef.current = null;
    clearFolderExpandTimer();
  }, [clearFolderExpandTimer]);

  return {
    sensors,
    collisionDetection,
    activeDrag,
    dropIntent,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}

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
import { dndHandlers } from "../lib/dnd/registry";
import type { DragItemData } from "../types/dnd";
import type { DropIntent, DndHandler } from "../lib/dnd/types";

// React context to share activeDrag + dropIntent without prop drilling
export const DragContext = createContext<{
  activeDrag: DragItemData | null;
  dropIntent: DropIntent | null;
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

function droppableType(collision: CollisionDescriptor): string | undefined {
  return (collision.data?.droppableContainer?.data?.current as Record<string, unknown> | undefined)
    ?.type as string | undefined;
}

/**
 * Filter collisions using the active handlers' `isValidTarget`, then apply
 * priority filtering for group-tab drags (tab > pane > sidebar-workspace).
 */
function filterCollisions(
  drag: DragItemData,
  collisions: CollisionDescriptor[],
  activeHandlers: DndHandler[],
): CollisionDescriptor[] {
  const filtered = collisions.filter((c) => {
    const data = c.data?.droppableContainer?.data?.current as Record<string, unknown> | undefined;
    if (!data) return false;
    return activeHandlers.some((h) => h.isValidTarget(drag, data));
  });

  // Priority filtering for group-tab drags:
  // tab targets > pane-drop targets > sidebar-workspace targets
  if (drag.type === "group-tab") {
    const tabTargets = filtered.filter((c) => droppableType(c) === "group-tab");
    if (tabTargets.length > 0) return tabTargets;

    const paneTargets = filtered.filter((c) => droppableType(c) === "pane-drop");
    if (paneTargets.length > 0) return paneTargets;

    const workspaceTargets = filtered.filter((c) => droppableType(c) === "sidebar-workspace");
    if (workspaceTargets.length > 0) return workspaceTargets;

    return [];
  }

  return filtered;
}

export function useDndOrchestrator() {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const folderExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredFolderIdRef = useRef<string | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  const store = useWorkspaceStore;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // Collision detection: pointerWithin for all targets, closestCenter fallback
  // for sortable items only. pane-drop zones use strict containment — they
  // ONLY match when the pointer is physically inside the drop zone.
  // closestCenter must never return pane-drop zones, otherwise dragging between
  // tabs (where pointer isn't inside any tab rect) would match a drop zone
  // by proximity and trigger an unintended split.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (!activeDrag) return [];

      const activeHandlers = dndHandlers.filter((h) => h.canHandle(activeDrag));

      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        return filterCollisions(
          activeDrag,
          pointerCollisions as CollisionDescriptor[],
          activeHandlers,
        );
      }

      // closestCenter fallback — EXCLUDE pane-drop zones. Drop zones require
      // strict pointer containment (pointerWithin), not proximity.
      const centerCollisions = closestCenter(args);
      return filterCollisions(
        activeDrag,
        centerCollisions.filter(
          (c) =>
            (c.data?.droppableContainer?.data?.current as Record<string, unknown>)?.type !==
            "pane-drop",
        ) as CollisionDescriptor[],
        activeHandlers,
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

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      const dragData = event.active.data.current as DragItemData;
      const pointer = getPointerPosition(event);
      pointerPosRef.current = pointer;

      if (!dragData || !pointer) {
        setDropIntent(null);
        return;
      }

      const collisions = ((event.collisions ?? []) as CollisionDescriptor[]).slice();

      // Iterate handlers in registry order — first non-null intent wins
      const activeHandlers = dndHandlers.filter((h) => h.canHandle(dragData));
      for (const handler of activeHandlers) {
        const intent = handler.resolveIntent({
          drag: dragData,
          collisions,
          pointer,
          store,
        });
        if (intent) {
          setDropIntent(intent);
          return;
        }
      }

      setDropIntent(null);
    },
    [store],
  );

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
      const { active } = event;
      setActiveDrag(null);
      clearFolderExpandTimer();
      const currentDropIntent = dropIntent;
      pointerPosRef.current = null;
      setDropIntent(null);

      if (!currentDropIntent) return;

      const dragData = active.data.current as DragItemData;
      if (!dragData) return;

      // Find the handler that can execute this intent
      const activeHandlers = dndHandlers.filter((h) => h.canHandle(dragData));
      for (const handler of activeHandlers) {
        // The handler's execute() checks intent.kind internally and returns
        // early if it's not their kind. We call execute on the first handler
        // that can handle this drag type — each handler guards by intent kind.
        handler.execute(currentDropIntent, store);
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

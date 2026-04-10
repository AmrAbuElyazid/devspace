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
 * priority filtering so workspace-area targets win over sidebar targets
 * when both are present.
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

    const sidebarItemTargets = filtered.filter((c) => {
      const type = droppableType(c);
      return type === "sidebar-workspace" || type === "sidebar-folder";
    });
    if (sidebarItemTargets.length > 0) return sidebarItemTargets;

    const sidebarRootTargets = filtered.filter((c) => droppableType(c) === "sidebar-root");
    if (sidebarRootTargets.length > 0) return sidebarRootTargets;

    return [];
  }

  // Priority filtering for sidebar-workspace drags:
  // Workspace-area targets (group-tab, pane-drop) take priority over sidebar
  // targets. Without this, closestCenter often returns sidebar-root as closest
  // when the pointer is on the tab bar spacer, causing the workspace to snap
  // to pinned instead of merging.
  if (drag.type === "sidebar-workspace") {
    const wsAreaTargets = filtered.filter((c) => {
      const t = droppableType(c);
      return t === "group-tab" || t === "pane-drop";
    });
    if (wsAreaTargets.length > 0) return wsAreaTargets;
  }

  if (drag.type === "sidebar-workspace" || drag.type === "sidebar-folder") {
    const sidebarItemTargets = filtered.filter((c) => {
      const type = droppableType(c);
      return type === "sidebar-workspace" || type === "sidebar-folder";
    });
    if (sidebarItemTargets.length > 0) return sidebarItemTargets;

    const sidebarRootTargets = filtered.filter((c) => droppableType(c) === "sidebar-root");
    if (sidebarRootTargets.length > 0) return sidebarRootTargets;
  }

  return filtered;
}

export function useDndOrchestrator() {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  // Ref mirror of dropIntent — onDragEnd reads from this to avoid stale
  // closure issues where React hasn't re-rendered between the last onDragMove
  // and onDragEnd.
  const dropIntentRef = useRef<DropIntent | null>(null);
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

      // closestCenter fallback — exclude targets that require strict pointer
      // containment (pane-drop zones). Also exclude sidebar targets when
      // dragging a sidebar-workspace, so the nearest tab wins over
      // sidebar-root when the pointer is on the tab bar spacer.
      const centerCollisions = closestCenter(args);
      const SIDEBAR_TYPES = new Set(["sidebar-workspace", "sidebar-folder", "sidebar-root"]);
      return filterCollisions(
        activeDrag,
        centerCollisions.filter((c) => {
          const t = (c.data?.droppableContainer?.data?.current as Record<string, unknown>)?.type as
            | string
            | undefined;
          if (t === "pane-drop") return false;
          if (activeDrag.type === "sidebar-workspace" && t && SIDEBAR_TYPES.has(t)) return false;
          return true;
        }) as CollisionDescriptor[],
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
    dropIntentRef.current = null;
  }, []);

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      const dragData = event.active.data.current as DragItemData;
      const pointer = getPointerPosition(event);
      pointerPosRef.current = pointer;

      if (!dragData || !pointer) {
        setDropIntent(null);
        dropIntentRef.current = null;
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
          dropIntentRef.current = intent;
          return;
        }
      }

      setDropIntent(null);
      dropIntentRef.current = null;
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
      // Read from ref to avoid stale closure — onDragMove may have updated
      // the intent after the last React render that created this callback.
      const currentDropIntent = dropIntentRef.current;
      pointerPosRef.current = null;
      dropIntentRef.current = null;
      setDropIntent(null);

      if (!currentDropIntent) return;

      const dragData = active.data.current as DragItemData;
      if (!dragData) return;

      // Dispatch to the handler that owns this intent kind. Each handler's
      // resolveIntent produced the intent, so only one handler should match.
      // We iterate in registry order and stop after the first match.
      const activeHandlers = dndHandlers.filter((h) => h.canHandle(dragData));
      for (const handler of activeHandlers) {
        if (handler.execute(currentDropIntent, store)) break;
      }
    },
    [clearFolderExpandTimer, store],
  );

  const onDragCancel = useCallback(() => {
    setActiveDrag(null);
    setDropIntent(null);
    dropIntentRef.current = null;
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

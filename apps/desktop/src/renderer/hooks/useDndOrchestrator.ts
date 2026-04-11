import { useCallback, useEffect, useRef } from "react";
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
import { create } from "zustand";
import { useWorkspaceStore } from "../store/workspace-store";
import { dndHandlers } from "../lib/dnd/registry";
import type { DragItemData } from "../types/dnd";
import type { DropIntent, DndHandler } from "../lib/dnd/types";

type DndState = {
  activeDrag: DragItemData | null;
  dropIntent: DropIntent | null;
};

const useDndStateStore = create<DndState>(() => ({
  activeDrag: null,
  dropIntent: null,
}));

export const useActiveDrag = () => useDndStateStore((state) => state.activeDrag);
export const useDropIntent = () => useDndStateStore((state) => state.dropIntent);

export function resetDndState(): void {
  useDndStateStore.setState({ activeDrag: null, dropIntent: null });
}

export function setDndState(state: Partial<DndState>): void {
  useDndStateStore.setState(state);
}

function areDropIntentsEqual(a: DropIntent | null, b: DropIntent | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => aRecord[key] === bRecord[key]);
}

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
  // Ref mirror of dropIntent — onDragEnd reads from this to avoid stale
  // closure issues where React hasn't re-rendered between the last onDragMove
  // and onDragEnd.
  const dropIntentRef = useRef<DropIntent | null>(useDndStateStore.getState().dropIntent);
  const folderExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredFolderIdRef = useRef<string | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  const store = useWorkspaceStore;

  useEffect(() => {
    return () => {
      resetDndState();
    };
  }, []);

  const setResolvedDropIntent = useCallback((next: DropIntent | null) => {
    if (areDropIntentsEqual(dropIntentRef.current, next)) {
      return;
    }

    dropIntentRef.current = next;
    setDndState({ dropIntent: next });
  }, []);

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
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeDrag = useDndStateStore.getState().activeDrag;
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
  }, []);

  const clearFolderExpandTimer = useCallback(() => {
    if (folderExpandTimerRef.current) {
      clearTimeout(folderExpandTimerRef.current);
      folderExpandTimerRef.current = null;
    }
    hoveredFolderIdRef.current = null;
  }, []);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as DragItemData;
      setDndState({ activeDrag: data });
      setResolvedDropIntent(null);
    },
    [setResolvedDropIntent],
  );

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      const dragData = event.active.data.current as DragItemData;
      const pointer = getPointerPosition(event);
      pointerPosRef.current = pointer;

      if (!dragData || !pointer) {
        setResolvedDropIntent(null);
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
          setResolvedDropIntent(intent);
          return;
        }
      }

      setResolvedDropIntent(null);
    },
    [setResolvedDropIntent, store],
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
      setDndState({ activeDrag: null });
      clearFolderExpandTimer();
      // Read from ref to avoid stale closure — onDragMove may have updated
      // the intent after the last React render that created this callback.
      const currentDropIntent = dropIntentRef.current;
      pointerPosRef.current = null;
      setResolvedDropIntent(null);

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
    [clearFolderExpandTimer, setResolvedDropIntent, store],
  );

  const onDragCancel = useCallback(() => {
    setDndState({ activeDrag: null });
    setResolvedDropIntent(null);
    pointerPosRef.current = null;
    clearFolderExpandTimer();
  }, [clearFolderExpandTimer, setResolvedDropIntent]);

  return {
    sensors,
    collisionDetection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}

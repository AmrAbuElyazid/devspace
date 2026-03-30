import type { DndHandler } from "./types";
import { sidebarReorderHandler } from "./handlers/sidebar-reorder";
import { tabReorderHandler } from "./handlers/tab-reorder";
import { tabSplitHandler } from "./handlers/tab-split";
import { tabToSidebarHandler } from "./handlers/tab-to-sidebar";
import { tabToWorkspaceHandler } from "./handlers/tab-to-workspace";
import { workspaceToActiveHandler } from "./handlers/workspace-to-active";

/**
 * Ordered handler registry. The orchestrator iterates in order —
 * first handler returning a non-null intent wins.
 *
 * Order matters:
 * - sidebarReorderHandler before workspaceToActiveHandler: both handle
 *   sidebar-workspace drags but match different targets (sidebar vs active area).
 * - tabToSidebarHandler before tabToWorkspaceHandler: for sidebar-workspace
 *   targets, handler 6 checks edge zones first and returns null for center
 *   zones, allowing handler 4 to handle them.
 */
export const dndHandlers: DndHandler[] = [
  sidebarReorderHandler,
  workspaceToActiveHandler,
  tabReorderHandler,
  tabSplitHandler,
  tabToSidebarHandler,
  tabToWorkspaceHandler,
];

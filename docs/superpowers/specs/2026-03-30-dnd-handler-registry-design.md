# DnD Handler Registry + Cross-Domain Drag-Drop Features

## Problem

The current drag-and-drop system is a monolithic hook (`useDragAndDrop.ts`, 463 lines) with nested conditionals, hardcoded collision filters, and type-specific intent resolution spread across multiple files. Adding new drag-drop interactions requires touching 5+ files and growing the already-complex `onDragEnd` handler.

Two new features are needed:
1. **Workspace to Active Area** -- drag a sidebar workspace onto the active workspace to merge tabs or create a split
2. **Tab to Sidebar Create** -- drag a tab to the sidebar to create a new workspace at any position

## Design

### Architecture: Handler Registry Pattern

Replace the monolithic DnD system with a registry of self-contained handlers. Each handler encapsulates one logical drag-drop interaction: what it handles, which targets are valid, how to resolve intent, and how to execute.

#### Core Types

```typescript
// types/dnd.ts -- extended

export type DropIntent =
  // Sidebar reorder
  | { kind: "reorder-sidebar"; nodeId: string; nodeType: "workspace" | "folder";
      sourceContainer: SidebarContainer; targetContainer: SidebarContainer;
      targetParentId: string | null; targetIndex: number }
  // Tab reorder within/between groups
  | { kind: "reorder-tab"; workspaceId: string; sourceGroupId: string; sourceTabId: string;
      targetGroupId: string; targetTabId: string }
  // Tab split pane
  | { kind: "split-group"; workspaceId: string; sourceGroupId: string; sourceTabId: string;
      targetGroupId: string; side: DropSide }
  // Tab to existing workspace
  | { kind: "move-to-workspace"; sourceWorkspaceId: string; sourceGroupId: string;
      sourceTabId: string; targetWorkspaceId: string }
  // NEW: Workspace merge into group
  | { kind: "merge-workspace"; sourceWorkspaceId: string; targetGroupId: string }
  // NEW: Workspace split into active area
  | { kind: "split-with-workspace"; sourceWorkspaceId: string; targetGroupId: string;
      side: DropSide }
  // NEW: Tab creates new workspace
  | { kind: "create-workspace-from-tab"; sourceWorkspaceId: string; sourceGroupId: string;
      sourceTabId: string; targetContainer: SidebarContainer;
      targetParentFolderId: string | null; targetIndex: number };
```

#### Handler Interface

```typescript
// lib/dnd/types.ts

interface ResolveContext {
  drag: DragItemData;
  collisions: CollisionDescriptor[];
  pointer: { x: number; y: number };
  store: typeof useWorkspaceStore;
}

interface DndHandler {
  id: string;
  // Does this handler apply to this drag item?
  canHandle(drag: DragItemData): boolean;
  // Is this droppable target valid? Used for collision filtering.
  isValidTarget(drag: DragItemData, targetData: Record<string, unknown>): boolean;
  // Resolve the drop intent from collision data (called on move + end)
  resolveIntent(ctx: ResolveContext): DropIntent | null;
  // Execute the drop action
  execute(intent: DropIntent, store: typeof useWorkspaceStore): void;
}
```

#### Handler Registry (6 handlers)

| # | Handler | File | Drag Type | Valid Targets | Intent |
|---|---------|------|-----------|---------------|--------|
| 1 | Sidebar Reorder | `handlers/sidebar-reorder.ts` | sidebar-workspace, sidebar-folder | sidebar-workspace, sidebar-folder, sidebar-root | `reorder-sidebar` |
| 2 | Tab Reorder | `handlers/tab-reorder.ts` | group-tab | group-tab | `reorder-tab` |
| 3 | Tab Split | `handlers/tab-split.ts` | group-tab | pane-drop | `split-group` |
| 4 | Tab to Workspace | `handlers/tab-to-workspace.ts` | group-tab | sidebar-workspace (center zone) | `move-to-workspace` |
| 5 | **Workspace to Active** | `handlers/workspace-to-active.ts` | sidebar-workspace | group-tab (merge), pane-drop (split) | `merge-workspace` or `split-with-workspace` |
| 6 | **Tab to Sidebar Create** | `handlers/tab-to-sidebar.ts` | group-tab | sidebar-root, sidebar-folder, sidebar-workspace (edge zone) | `create-workspace-from-tab` |

#### Orchestrator

```typescript
// hooks/useDndOrchestrator.ts (~80 lines)

export function useDndOrchestrator(handlers: DndHandler[]) {
  // On drag start: find matching handlers via canHandle()
  // Build collision filter: aggregate isValidTarget() from all matching handlers
  // On drag move: iterate handlers, call resolveIntent(), first non-null wins
  // On drag end: execute matched handler
  // On drag over: auto-expand folders (cross-cutting concern, stays in orchestrator)
}
```

The orchestrator replaces `useDragAndDrop.ts`. The collision detection strategy (pointerWithin + closestCenter fallback, excluding pane-drop from fallback) stays in the orchestrator since it's infrastructure, not handler-specific.

#### File Layout

```
apps/desktop/src/renderer/
  lib/dnd/
    types.ts              # DndHandler interface, ResolveContext, DropIntent
    registry.ts           # Handler array + registration
    collision.ts          # Collision detection strategy (from useDragAndDrop.ts)
    handlers/
      sidebar-reorder.ts  # Existing sidebar reorder logic
      tab-reorder.ts      # Existing tab reorder logic
      tab-split.ts        # Existing tab-to-pane split logic
      tab-to-workspace.ts # Existing tab-to-workspace move
      workspace-to-active.ts  # NEW
      tab-to-sidebar.ts       # NEW
  hooks/
    useDndOrchestrator.ts     # Replaces useDragAndDrop.ts
```

Existing files to delete after migration:
- `lib/dnd-collision-filter.ts` (logic moves into orchestrator + handlers)
- `lib/tab-dnd-intent.ts` (logic moves into handlers 2-4)
- `lib/sidebar-drop-resolution.ts` (logic moves into handler 1, 6)
- `hooks/useDragAndDrop.ts` (replaced by `useDndOrchestrator.ts`)

### Feature 1: Workspace to Active Area

**Handler 5: `workspace-to-active.ts`**

`canHandle`: drag.type === "sidebar-workspace"

`isValidTarget`: targetType === "group-tab" || targetType === "pane-drop"

`resolveIntent`:
- If target is `group-tab`: resolve to `merge-workspace` intent
- If target is `pane-drop`: resolve to `split-with-workspace` intent, computing the closest side from pointer position

`execute`:
- `merge-workspace`: call `store.getState().mergeWorkspaceIntoGroup(sourceWsId, targetGroupId)`
- `split-with-workspace`: call `store.getState().splitGroupWithWorkspace(sourceWsId, targetGroupId, side)`

**New store method: `mergeWorkspaceIntoGroup(sourceWorkspaceId, targetGroupId)`**
1. Collect ALL tabs from ALL groups in the source workspace (flatten)
2. Append them to the target group's tab list
3. Register each pane in the flat pane map (they're already there since panes are stored flat)
4. Clean up: remove source workspace's groups from paneGroups map, remove source workspace from workspaces array, remove from sidebar tree
5. If the source workspace was active, switch active to the workspace containing targetGroupId

**New store method: `splitGroupWithWorkspace(sourceWorkspaceId, targetGroupId, side)`**
1. Collect ALL tabs from ALL groups in the source workspace (flatten)
2. Create a new PaneGroup with those tabs
3. Call existing split logic to insert the new group adjacent to targetGroupId in the split tree
4. Clean up: remove source workspace's old groups, remove source from sidebar tree
5. If the source workspace was active, switch active to the workspace containing targetGroupId

**Visual feedback**: When dragging a sidebar workspace over the active area:
- Tab bar: existing `group-tab-drop-target` highlight style (merge indicator)
- Pane area: existing `pane-drop-zone-half` directional highlight (split indicator)

**Conflict resolution with Handler 1**: Both handlers match `sidebar-workspace` drags. The orchestrator resolves this by checking `isValidTarget` -- if hovering over a sidebar target, Handler 1 matches; if hovering over a group-tab or pane-drop target, Handler 5 matches. They never conflict because they accept different target types.

### Feature 2: Tab to Sidebar Create

**Handler 6: `tab-to-sidebar.ts`**

`canHandle`: drag.type === "group-tab"

`isValidTarget`: targetType === "sidebar-root" || targetType === "sidebar-folder" || targetType === "sidebar-workspace"

`resolveIntent`:
- For `sidebar-root`: resolve to `create-workspace-from-tab` at root level (end of container)
- For `sidebar-folder`: resolve to `create-workspace-from-tab` inside that folder (center zone) or between items (edge zone)
- For `sidebar-workspace`: check pointer position against workspace item rect:
  - **Edge zone** (top/bottom 25%): resolve to `create-workspace-from-tab` at that position
  - **Center zone** (middle 50%): return `null` (let Handler 4 handle it as "move to workspace")

`execute`:
- Call `store.getState().createWorkspaceFromTab(tabId, sourceGroupId, sourceWorkspaceId, opts)`

**New store method: `createWorkspaceFromTab(tabId, sourceGroupId, sourceWorkspaceId, opts)`**

`opts: { parentFolderId?: string | null; container?: SidebarContainer; insertIndex?: number }`

1. Find the tab and its pane in the source group
2. Extract the tab from the source group (use existing `resolveSourceGroupAfterRemoval` for cleanup)
3. Create a new workspace:
   - Name: use the pane's title
   - Root: single leaf group containing the extracted tab
   - The pane record stays in the flat pane map (just re-associated)
4. Insert into sidebar tree at the specified position
5. Set the new workspace as active

**Conflict resolution with Handler 4**: Both handlers accept `group-tab` drags over `sidebar-workspace` targets. Resolution uses pointer position:
- Handler 6 checks edge zones (top/bottom 25%) and returns intent for those
- Handler 4 checks center zone (middle 50%) and returns intent for that
- The orchestrator calls handlers in priority order. Handler 4 (move-to-workspace) should have higher priority for sidebar-workspace targets. Handler 6 only wins when the pointer is in the edge zone of a workspace item, or on a folder/root target.

Implementation: Handler 6's `resolveIntent` for sidebar-workspace targets returns `null` for center zone, allowing Handler 4 to handle it. For edge zones, Handler 6 returns `create-workspace-from-tab`.

**Visual feedback**: When dragging a tab to the sidebar:
- Edge zone of workspace item: insertion line indicator (same `sidebar-insert-before`/`sidebar-insert-after` CSS)
- Center zone of workspace item: existing `ws-item-tab-drop` highlight
- Folder center: `sidebar-item-drag-over-folder` highlight
- Root area: root container highlight

### Sidebar Visual Redesign

Enhance the sidebar visual design while implementing the new DnD features:

- Richer workspace items with pane type indicators (small icons showing terminal/browser/editor composition)
- Subtle visual hierarchy improvements for folders vs workspaces
- Better drag feedback with smooth animations
- Refined spacing and typography

The specific visual changes will be designed during implementation using the frontend-design skill.

### DragContext Changes

The shared `DragContext` currently exposes `{ activeDrag, dropIntent: TabDropIntent | null }`. With the handler registry, `dropIntent` becomes the unified `DropIntent` type. The `DragOverlay` in `App.tsx` continues to render based on `activeDrag.type` (no change needed).

### Component Changes

**`PaneGroupContainer.tsx`**: The `PaneContentDropZone` currently only enables when `activeDrag?.type === "group-tab"`. It needs to also enable for `sidebar-workspace` drags to support the split-with-workspace interaction. The `previewSide` computation extends to check `split-with-workspace` intents.

**`SortableWorkspaceItem.tsx`**: The insertion indicator currently only shows for sidebar drags (`isSidebarDrag`). It needs to also show edge-zone indicators for `group-tab` drags (for the create-workspace-from-tab feature).

**`SortableFolderItem.tsx`**: Similar -- the folder highlight and edge indicators need to respond to `group-tab` drags for the create-workspace-from-tab feature.

**`Sidebar.tsx`**: The root droppable zones currently only highlight for sidebar drags. They need to also respond to `group-tab` drags.

### Testing Strategy

Each handler is a pure function (given context, return intent; given intent + store, execute). This enables unit testing without DnD framework mocking:

- Test each handler's `resolveIntent` with mock collision data
- Test each handler's `execute` with a mock store
- Test conflict resolution between handlers 4 and 6 (center vs edge zone)
- Test workspace merge/split store methods independently

### Migration Plan

The refactor preserves all existing behavior:
1. Create the handler interface and registry
2. Extract existing logic into handlers 1-4 (no behavior change)
3. Replace `useDragAndDrop` with `useDndOrchestrator`
4. Add handlers 5-6 with new store methods
5. Update components for new drop targets
6. Delete old files
7. Apply sidebar visual improvements

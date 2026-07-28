import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, ChevronLeft, Copy, FolderPlus, Search, Trash2, X, Settings } from "lucide-react";

import appIconUrl from "@/assets/app-icon.png";

import { useWorkspaceStore } from "@/store/workspace-store";
import { useSettingsStore } from "@/store/settings-store";
import { useTrafficLightGutter } from "@/store/window-chrome-store";
import { resolveDisplayString } from "../../../shared/shortcuts";
import { useActiveDrag, useDropIntent } from "@/hooks/useDndOrchestrator";
import { acquireNativeViewShield, releaseNativeViewShield } from "@/hooks/useNativeViewDragShield";
import { findSidebarNode } from "@/lib/sidebar-tree";
import type { ContextMenuItem } from "../../../shared/types";
import type { SidebarContainer } from "@/types/dnd";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { SidebarTreeLevel } from "./SidebarTreeLevel";
import { SidebarProvider, type SidebarContextValue } from "./SidebarContext";
import { QuickLaunchGrid } from "./QuickLaunchGrid";
import { SidebarUpdateButton } from "./SidebarUpdateButton";
import { useSidebarSelection } from "./useSidebarSelection";

function clampSidebarWidth(width: number): number {
  return Math.max(180, Math.min(420, width));
}

const iconButtonClass = cn(
  "no-drag chrome-focus inline-flex items-center justify-center rounded-md",
  "text-muted-foreground hover:text-foreground hover:bg-row-hover transition-colors",
);

export default function Sidebar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const removeWorkspaces = useWorkspaceStore((s) => s.removeWorkspaces);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const pinnedSidebarNodes = useWorkspaceStore((s) => s.pinnedSidebarNodes);
  const sidebarTree = useWorkspaceStore((s) => s.sidebarTree);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const removeFolder = useWorkspaceStore((s) => s.removeFolder);
  const renameFolder = useWorkspaceStore((s) => s.renameFolder);
  const toggleFolderCollapsed = useWorkspaceStore((s) => s.toggleFolderCollapsed);
  const togglePinWorkspace = useWorkspaceStore((s) => s.togglePinWorkspace);
  const pinFolder = useWorkspaceStore((s) => s.pinFolder);
  const unpinFolder = useWorkspaceStore((s) => s.unpinFolder);
  const pendingEditId = useWorkspaceStore((s) => s.pendingEditId);
  const pendingEditType = useWorkspaceStore((s) => s.pendingEditType);
  const clearPendingEdit = useWorkspaceStore((s) => s.clearPendingEdit);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleSettings = useSettingsStore((s) => s.toggleSettings);

  const trafficLightGutter = useTrafficLightGutter();
  const activeDrag = useActiveDrag();
  const dropIntent = useDropIntent();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"workspace" | "folder" | null>(null);

  useEffect(() => {
    if (pendingEditId && (pendingEditType === "workspace" || pendingEditType === "folder")) {
      setEditingId(pendingEditId);
      setEditingType(pendingEditType);
      clearPendingEdit();
    }
  }, [pendingEditId, pendingEditType, clearPendingEdit]);

  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [liveSidebarWidth, setLiveSidebarWidth] = useState<number | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number; currentWidth: number } | null>(
    null,
  );
  const renderedSidebarWidth = liveSidebarWidth ?? sidebarWidth;

  const workspaceIds = useMemo(
    () => new Set(workspaces.map((workspace) => workspace.id)),
    [workspaces],
  );
  const selection = useSidebarSelection(
    pinnedSidebarNodes,
    sidebarTree,
    workspaceIds,
    setActiveWorkspace,
  );
  const { selectedIds, actionTargets, clear: clearSelection } = selection;
  const selectedCount = selectedIds.size;

  const filteredWorkspaceIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(workspaces.filter((ws) => ws.name.toLowerCase().includes(q)).map((ws) => ws.id));
  }, [searchQuery, workspaces]);

  const workspaceContainer = useCallback(
    (workspaceId: string): SidebarContainer => {
      return findSidebarNode(pinnedSidebarNodes, workspaceId, "workspace") ? "pinned" : "main";
    },
    [pinnedSidebarNodes],
  );

  const folderContainer = useCallback(
    (folderId: string): SidebarContainer => {
      return findSidebarNode(pinnedSidebarNodes, folderId, "folder") ? "pinned" : "main";
    },
    [pinnedSidebarNodes],
  );

  const isSidebarDrag =
    activeDrag?.type === "sidebar-workspace" || activeDrag?.type === "sidebar-folder";
  const isRelevantDrag = isSidebarDrag || activeDrag?.type === "group-tab";
  const { setNodeRef: setPinnedRootRef, isOver: isPinnedRootOver } = useDroppable({
    id: "sidebar-root-pinned",
    data: { type: "sidebar-root" as const, container: "pinned", visible: true },
  });
  const { setNodeRef: setMainRootRef, isOver: isMainRootOver } = useDroppable({
    id: "sidebar-root-main",
    data: { type: "sidebar-root" as const, container: "main", visible: true },
  });

  const getRootInsertClass = useCallback(
    (container: SidebarContainer, nodeCount: number): string => {
      if (
        dropIntent?.kind === "reorder-sidebar" &&
        dropIntent.targetContainer === container &&
        dropIntent.targetParentId === null
      ) {
        if (nodeCount === 0 && dropIntent.targetIndex === 0) return "insert-before";
        if (dropIntent.targetIndex === nodeCount) return "insert-after";
      }
      if (
        dropIntent?.kind === "create-workspace-from-tab" &&
        dropIntent.targetContainer === container &&
        dropIntent.targetParentFolderId === null
      ) {
        if (nodeCount === 0 && dropIntent.targetIndex === 0) return "insert-before";
        if (dropIntent.targetIndex === nodeCount) return "insert-after";
      }
      return "";
    },
    [dropIntent],
  );

  const pinnedRootInsertClass = getRootInsertClass("pinned", pinnedSidebarNodes.length);
  const mainRootInsertClass = getRootInsertClass("main", sidebarTree.length);

  // Dragging the divider right sweeps the cursor straight across the panes.
  // Native views swallow every mouse event inside their bounds, so listening on
  // `document` used to lose the release and leave the sidebar stuck in resize
  // mode. Pointer capture keeps the events coming to the divider itself, and
  // the shield takes the views out of the way for the duration.
  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.isPrimary === false || e.button !== 0) return;
      e.preventDefault();

      // Capture routes the rest of this pointer's stream to the divider, so
      // there is no need to filter by pointerId below.
      const divider = e.currentTarget;
      const { pointerId } = e;
      divider.setPointerCapture?.(pointerId);
      acquireNativeViewShield();

      resizeRef.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
        currentWidth: sidebarWidth,
      };
      setLiveSidebarWidth(sidebarWidth);
      setIsResizing(true);

      const onPointerMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return;
        const delta = ev.clientX - resizeRef.current.startX;
        const nextWidth = clampSidebarWidth(resizeRef.current.startWidth + delta);
        resizeRef.current.currentWidth = nextWidth;
        setLiveSidebarWidth(nextWidth);
      };

      const onPointerRelease = () => {
        const nextWidth = resizeRef.current?.currentWidth;
        if (nextWidth !== undefined) setSidebarWidth(nextWidth);
        setIsResizing(false);
        setLiveSidebarWidth(null);
        resizeRef.current = null;
        divider.removeEventListener("pointermove", onPointerMove);
        divider.removeEventListener("pointerup", onPointerRelease);
        divider.removeEventListener("pointercancel", onPointerRelease);
        // pointerup releases capture implicitly; releasing again would throw.
        if (divider.hasPointerCapture?.(pointerId)) {
          divider.releasePointerCapture(pointerId);
        }
        releaseNativeViewShield();
      };

      divider.addEventListener("pointermove", onPointerMove);
      divider.addEventListener("pointerup", onPointerRelease);
      divider.addEventListener("pointercancel", onPointerRelease);
    },
    [sidebarWidth, setSidebarWidth],
  );

  const startEditingWorkspace = useCallback((id: string) => {
    setEditingId(id);
    setEditingType("workspace");
  }, []);
  const startEditingFolder = useCallback((id: string) => {
    setEditingId(id);
    setEditingType("folder");
  }, []);
  const stopEditing = useCallback(() => {
    setEditingId(null);
    setEditingType(null);
  }, []);

  const duplicateWorkspaces = useCallback(
    (ids: string[]) => {
      for (const id of ids) duplicateWorkspace(id);
      clearSelection();
    },
    [duplicateWorkspace, clearSelection],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTargets) return;
    removeWorkspaces(deleteTargets);
    clearSelection();
  }, [deleteTargets, removeWorkspaces, clearSelection]);

  const handleWorkspaceContextMenu = useCallback(
    async (e: React.MouseEvent, workspaceId: string) => {
      e.preventDefault();
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      const targets = actionTargets(workspaceId);
      const many = targets.length > 1;
      const isPinned = workspaceContainer(workspaceId) === "pinned";
      // Deleting everything would leave the app with no workspace at all, so
      // the entry only appears while at least one would survive.
      const canDelete = workspaces.length > targets.length;
      const items: ContextMenuItem[] = many
        ? [
            { id: "duplicate", label: `Duplicate ${targets.length} Workspaces` },
            ...(canDelete
              ? [
                  {
                    id: "delete",
                    label: `Delete ${targets.length} Workspaces`,
                    destructive: true,
                  },
                ]
              : []),
          ]
        : [
            { id: "rename", label: "Rename" },
            { id: "duplicate", label: "Duplicate" },
            { id: "pin", label: isPinned ? "Unpin" : "Pin" },
            { id: "new-folder", label: "New Folder..." },
            ...(canDelete ? [{ id: "delete", label: "Delete", destructive: true }] : []),
          ];
      const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY });
      if (!result) return;
      if (result === "rename") startEditingWorkspace(workspaceId);
      else if (result === "duplicate") duplicateWorkspaces(targets);
      else if (result === "pin") togglePinWorkspace(workspaceId);
      else if (result === "new-folder") addFolder("New Folder");
      else if (result === "delete") setDeleteTargets(targets);
    },
    [
      workspaces,
      actionTargets,
      workspaceContainer,
      startEditingWorkspace,
      duplicateWorkspaces,
      addFolder,
      togglePinWorkspace,
    ],
  );

  const handleFolderContextMenu = useCallback(
    async (e: React.MouseEvent, folderId: string) => {
      e.preventDefault();
      const container = folderContainer(folderId);
      const isPinned = container === "pinned";
      const items: ContextMenuItem[] = [
        { id: "rename", label: "Rename Folder" },
        { id: "pin", label: isPinned ? "Unpin" : "Pin" },
        { id: "add-workspace", label: "Add Workspace" },
        { id: "add-subfolder", label: "Add Sub-folder" },
        { id: "delete", label: "Delete Folder", destructive: true },
      ];
      const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY });
      if (result === "rename") startEditingFolder(folderId);
      else if (result === "pin") {
        if (isPinned) unpinFolder(folderId);
        else pinFolder(folderId);
      } else if (result === "add-workspace") {
        if (defaultPaneType === "picker") {
          useSettingsStore
            .getState()
            .openPanePicker({ action: "new-workspace", parentFolderId: folderId, container });
        } else {
          addWorkspace(undefined, folderId, container, defaultPaneType);
        }
      } else if (result === "add-subfolder") addFolder("New Folder", folderId, container);
      else if (result === "delete") removeFolder(folderId);
    },
    [
      folderContainer,
      startEditingFolder,
      addWorkspace,
      addFolder,
      removeFolder,
      pinFolder,
      unpinFolder,
      defaultPaneType,
    ],
  );

  const handleAddWorkspaceToFolder = useCallback(
    (folderId: string, container: SidebarContainer) => {
      if (defaultPaneType === "picker") {
        useSettingsStore
          .getState()
          .openPanePicker({ action: "new-workspace", parentFolderId: folderId, container });
      } else {
        addWorkspace(undefined, folderId, container, defaultPaneType);
      }
    },
    [addWorkspace, defaultPaneType],
  );

  const requestDelete = useCallback((workspaceId: string) => {
    setDeleteTargets([workspaceId]);
  }, []);

  const sidebarContextValue = useMemo<SidebarContextValue>(
    () => ({
      editingId,
      editingType,
      filteredWorkspaceIds,
      onStartEditingFolder: startEditingFolder,
      onStartEditingWorkspace: startEditingWorkspace,
      onRenameFolder: renameFolder,
      onRenameWorkspace: renameWorkspace,
      onStopEditing: stopEditing,
      onContextMenuFolder: handleFolderContextMenu,
      onContextMenuWorkspace: handleWorkspaceContextMenu,
      onSelectWorkspace: selection.handleRowClick,
      onAddWorkspaceToFolder: handleAddWorkspaceToFolder,
      activeWorkspaceId,
      selectedWorkspaceIds: selectedIds,
      toggleFolderCollapsed,
      onRequestDelete: requestDelete,
    }),
    [
      editingId,
      editingType,
      filteredWorkspaceIds,
      startEditingFolder,
      startEditingWorkspace,
      renameFolder,
      renameWorkspace,
      stopEditing,
      handleFolderContextMenu,
      handleWorkspaceContextMenu,
      selection.handleRowClick,
      handleAddWorkspaceToFolder,
      activeWorkspaceId,
      selectedIds,
      toggleFolderCollapsed,
      requestDelete,
    ],
  );

  const deleteCount = deleteTargets?.length ?? 0;

  return (
    <SidebarProvider value={sidebarContextValue}>
      <aside
        data-state={sidebarOpen ? "open" : "collapsed"}
        data-resizing={isResizing || undefined}
        className={cn(
          "relative flex flex-col shrink-0 overflow-hidden bg-rail text-foreground",
          "border-r border-border",
          "@container/sidebar",
          "transition-[width,opacity] duration-200 ease-out",
          !sidebarOpen && "!w-0 opacity-0 pointer-events-none",
          isResizing && "!transition-none",
        )}
        style={
          sidebarOpen ? { width: renderedSidebarWidth, minWidth: renderedSidebarWidth } : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Escape" && selectedCount > 0) clearSelection();
        }}
      >
        <div className="relative z-[1] flex flex-col h-full min-h-0">
          {/* Header — drag region. The left padding is whatever the main
              process says the native traffic lights occupy, so it collapses to
              nothing in fullscreen instead of leaving a hole. */}
          <div
            className="drag-region flex items-center justify-between h-12 shrink-0 pr-2"
            style={{ paddingLeft: trafficLightGutter || 12 }}
          >
            <span className="app-title no-drag select-none inline-flex items-center font-sans font-semibold text-ui-lg leading-none tracking-tight">
              <img
                src={appIconUrl}
                alt=""
                aria-hidden
                draggable={false}
                className="app-title-icon h-[18px] w-auto -my-1 -mr-px shrink-0 select-none"
              />
              <span className="app-title-text app-title-text--ev">ev</span>
              <span className="app-title-text app-title-text--space">space</span>
            </span>
            <HintTooltip
              content="Hide sidebar"
              shortcut={resolveDisplayString("toggle-sidebar")}
              sideOffset={4}
              align="end"
            >
              <button
                type="button"
                className={cn(iconButtonClass, "size-7")}
                onClick={toggleSidebar}
                aria-label="Toggle sidebar"
              >
                <ChevronLeft size={14} strokeWidth={2.2} />
              </button>
            </HintTooltip>
          </div>

          {/* Quick launch */}
          <div className="px-3 pt-1 pb-3">
            <QuickLaunchGrid />
          </div>

          {/* Search */}
          <div className="px-3 pb-3">
            <div
              className={cn(
                "no-drag relative flex items-center h-8 rounded-lg gap-2 px-3",
                "bg-elevated/60 border border-border",
                "focus-within:border-brand-edge focus-within:bg-elevated",
                "transition-colors",
              )}
            >
              <Search size={12} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search workspaces"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchQuery("");
                }}
                aria-label="Search workspaces"
                className={cn(
                  "flex-1 min-w-0 bg-transparent border-0 outline-none",
                  "text-ui-sm text-foreground placeholder:text-muted-foreground",
                )}
              />
              {searchQuery ? (
                <button
                  className={cn(iconButtonClass, "size-4 shrink-0")}
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={9} />
                </button>
              ) : (
                <Kbd className="no-drag h-[18px] min-w-[18px] px-1.5 text-ui-micro font-mono shrink-0">
                  /
                </Kbd>
              )}
            </div>
          </div>

          {/* Pinned section */}
          {pinnedSidebarNodes.length > 0 && (
            <>
              <SectionHeader label="Pinned" />
              <div
                ref={setPinnedRootRef}
                className={cn(
                  "relative px-2 pb-2 flex flex-col gap-0.5",
                  isRelevantDrag && isPinnedRootOver && "drop-into-folder",
                  pinnedRootInsertClass,
                )}
              >
                <SidebarTreeLevel
                  nodes={pinnedSidebarNodes}
                  container="pinned"
                  parentFolderId={null}
                  depth={0}
                />
              </div>
            </>
          )}

          {/* Workspaces section */}
          <SectionHeader label="Workspaces" count={workspaces.length}>
            <HintTooltip content="New folder" sideOffset={4} align="end">
              <button
                type="button"
                onClick={() => addFolder("New Folder")}
                className={cn(iconButtonClass, "size-5")}
                aria-label="New folder"
              >
                <FolderPlus size={11} strokeWidth={1.8} />
              </button>
            </HintTooltip>
            <HintTooltip
              content="New workspace"
              shortcut={resolveDisplayString("new-workspace")}
              sideOffset={4}
              align="end"
            >
              <button
                type="button"
                onClick={() => {
                  if (defaultPaneType === "picker") {
                    useSettingsStore
                      .getState()
                      .openPanePicker({ action: "new-workspace", container: "main" });
                  } else {
                    addWorkspace(undefined, null, "main", defaultPaneType);
                  }
                }}
                className={cn(iconButtonClass, "size-5")}
                aria-label="New workspace"
              >
                <Plus size={12} strokeWidth={2.2} />
              </button>
            </HintTooltip>
          </SectionHeader>

          {/* Workspace tree. The droppable stretches to the bottom of the
              scroll viewport rather than hugging the rows, so the empty space
              below the list is a drop target too. */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex min-h-full flex-col">
                <div
                  ref={setMainRootRef}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) clearSelection();
                  }}
                  className={cn(
                    "relative flex-1 px-2 pb-3 flex flex-col gap-0.5",
                    isRelevantDrag && isMainRootOver && "drop-into-folder",
                    mainRootInsertClass,
                  )}
                >
                  <SidebarTreeLevel
                    nodes={sidebarTree}
                    container="main"
                    parentFolderId={null}
                    depth={0}
                  />
                  {sidebarTree.length === 0 ? (
                    <p className="px-2 py-3 text-ui-xs text-muted-foreground select-none">
                      No workspaces yet — drop a tab here or press{" "}
                      {resolveDisplayString("new-workspace")}.
                    </p>
                  ) : null}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Bulk action bar — only present while a multi-selection exists. */}
          {selectedCount > 0 ? (
            <div className="shrink-0 border-t border-border px-2 py-2">
              <div className="flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1.5">
                <span className="flex-1 text-ui-xs font-medium tabular-nums">
                  {selectedCount} selected
                </span>
                <HintTooltip content="Duplicate" sideOffset={4} align="end">
                  <button
                    type="button"
                    className={cn(iconButtonClass, "size-6")}
                    aria-label={`Duplicate ${selectedCount} workspaces`}
                    onClick={() => duplicateWorkspaces([...selectedIds])}
                  >
                    <Copy size={12} />
                  </button>
                </HintTooltip>
                {workspaces.length > selectedCount ? (
                  <HintTooltip content="Delete" sideOffset={4} align="end">
                    <button
                      type="button"
                      className={cn(
                        iconButtonClass,
                        "size-6 hover:text-destructive hover:bg-destructive/10",
                      )}
                      aria-label={`Delete ${selectedCount} workspaces`}
                      onClick={() => setDeleteTargets([...selectedIds])}
                    >
                      <Trash2 size={12} />
                    </button>
                  </HintTooltip>
                ) : null}
                <HintTooltip content="Clear selection" sideOffset={4} align="end">
                  <button
                    type="button"
                    className={cn(iconButtonClass, "size-6")}
                    aria-label="Clear selection"
                    onClick={clearSelection}
                  >
                    <X size={12} />
                  </button>
                </HintTooltip>
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-2 py-2 flex flex-col gap-1">
            <SidebarUpdateButton />
            <button
              type="button"
              onClick={toggleSettings}
              className={cn("chrome-row chrome-focus no-drag h-8 gap-2.5 px-2.5 text-ui-sm")}
              title={`Settings (${resolveDisplayString("toggle-settings")})`}
            >
              <Settings size={13} strokeWidth={1.6} className="text-muted-foreground" />
              <span className="flex-1 text-left">Settings</span>
              <Kbd className="h-[18px] min-w-[18px] px-1.5 text-ui-micro font-mono">
                {resolveDisplayString("toggle-settings")}
              </Kbd>
            </button>
          </div>
        </div>

        {/* Resize handle (right edge) */}
        {sidebarOpen && (
          <div
            className={cn(
              "absolute top-0 right-0 bottom-0 w-1 cursor-col-resize z-[2]",
              "hover:bg-brand/40 transition-colors",
              isResizing && "bg-brand/60",
            )}
            onPointerDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          open={deleteCount > 0}
          onOpenChange={() => setDeleteTargets(null)}
          title={deleteCount > 1 ? `Delete ${deleteCount} workspaces?` : "Delete workspace?"}
          description={
            deleteCount > 1
              ? `These ${deleteCount} workspaces and all their tabs will be permanently removed. This action cannot be undone.`
              : "This workspace and all its tabs will be permanently removed. This action cannot be undone."
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={confirmDelete}
        />
      </aside>
    </SidebarProvider>
  );
}

function SectionHeader({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1.5 select-none">
      <div className="inline-flex items-baseline gap-2">
        <span className="text-ui-micro font-mono uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {typeof count === "number" ? (
          <span className="text-ui-micro font-mono tabular-nums text-muted-foreground/60">
            {count}
          </span>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-0.5">{children}</div> : null}
    </div>
  );
}

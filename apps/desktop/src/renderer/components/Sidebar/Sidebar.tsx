import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, ChevronLeft, FolderPlus, Search, X, Settings } from "lucide-react";

import { useWorkspaceStore } from "@/store/workspace-store";
import { useSettingsStore } from "@/store/settings-store";
import { resolveDisplayString } from "../../../shared/shortcuts";
import { useActiveDrag, useDropIntent } from "@/hooks/useDndOrchestrator";
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

function clampSidebarWidth(width: number): number {
  return Math.max(180, Math.min(420, width));
}

export default function Sidebar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
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

  const [isFullScreen, setIsFullScreen] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    void window.api.window.isFullScreen().then((fullScreen) => {
      if (!cancelled) setIsFullScreen(fullScreen);
    });
    const unsubscribe = window.api.window.onFullScreenChange(setIsFullScreen);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [liveSidebarWidth, setLiveSidebarWidth] = useState<number | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number; currentWidth: number } | null>(
    null,
  );
  const renderedSidebarWidth = liveSidebarWidth ?? sidebarWidth;

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

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
        currentWidth: sidebarWidth,
      };
      setLiveSidebarWidth(sidebarWidth);
      setIsResizing(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = ev.clientX - resizeRef.current.startX;
        const nextWidth = clampSidebarWidth(resizeRef.current.startWidth + delta);
        resizeRef.current.currentWidth = nextWidth;
        setLiveSidebarWidth(nextWidth);
      };
      const onMouseUp = () => {
        const nextWidth = resizeRef.current?.currentWidth;
        if (nextWidth !== undefined) setSidebarWidth(nextWidth);
        setIsResizing(false);
        setLiveSidebarWidth(null);
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
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

  const handleWorkspaceContextMenu = useCallback(
    async (e: React.MouseEvent, workspaceId: string) => {
      e.preventDefault();
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      const isPinned = workspaceContainer(workspaceId) === "pinned";
      const items: ContextMenuItem[] = [
        { id: "rename", label: "Rename" },
        { id: "pin", label: isPinned ? "Unpin" : "Pin" },
        { id: "new-folder", label: "New Folder..." },
        ...(workspaces.length > 1 ? [{ id: "delete", label: "Delete", destructive: true }] : []),
      ];
      const result = await window.api.contextMenu.show(items, { x: e.clientX, y: e.clientY });
      if (!result) return;
      if (result === "rename") startEditingWorkspace(workspaceId);
      else if (result === "pin") togglePinWorkspace(workspaceId);
      else if (result === "new-folder") addFolder("New Folder");
      else if (result === "delete") setDeleteTarget(workspaceId);
    },
    [workspaces, workspaceContainer, startEditingWorkspace, addFolder, togglePinWorkspace],
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
      onSelectWorkspace: setActiveWorkspace,
      onAddWorkspaceToFolder: handleAddWorkspaceToFolder,
      activeWorkspaceId,
      toggleFolderCollapsed,
      deleteTarget,
      setDeleteTarget,
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
      setActiveWorkspace,
      handleAddWorkspaceToFolder,
      activeWorkspaceId,
      toggleFolderCollapsed,
      deleteTarget,
    ],
  );

  return (
    <SidebarProvider value={sidebarContextValue}>
      <aside
        data-state={sidebarOpen ? "open" : "collapsed"}
        data-resizing={isResizing || undefined}
        className={cn(
          "relative flex flex-col shrink-0 bg-sidebar text-foreground",
          "border-r border-border/60",
          "transition-[width,opacity] duration-200 ease-out",
          !sidebarOpen && "!w-0 opacity-0 pointer-events-none",
          isResizing && "!transition-none",
        )}
        style={
          sidebarOpen ? { width: renderedSidebarWidth, minWidth: renderedSidebarWidth } : undefined
        }
      >
        {/* Header — drag region + traffic-light reserve when not fullscreen */}
        <div
          className={cn(
            "drag-region flex items-center justify-between h-[44px] shrink-0",
            isFullScreen ? "pl-3" : "pl-[88px]",
            "pr-2",
          )}
        >
          <span className="no-drag select-none inline-flex items-baseline gap-[3px] font-sans font-semibold text-[14px] leading-none tracking-tight">
            <span className="text-brand">dev</span>
            <span className="text-foreground/75">space</span>
          </span>
          <HintTooltip
            content="Hide sidebar"
            shortcut={resolveDisplayString("toggle-sidebar")}
            sideOffset={4}
            align="end"
          >
            <button
              type="button"
              className={cn(
                "no-drag inline-flex items-center justify-center size-6 rounded-md",
                "text-muted-foreground/80 hover:text-foreground hover:bg-hover",
                "transition-colors",
              )}
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              <ChevronLeft size={14} strokeWidth={2.2} />
            </button>
          </HintTooltip>
        </div>

        {/* Quick launch */}
        <div className="px-2 pt-1 pb-2">
          <QuickLaunchGrid />
        </div>

        {/* Search */}
        <div className="px-2 pb-2">
          <div
            className={cn(
              "no-drag group/search relative flex items-center h-7 rounded-md",
              "bg-surface/70 border border-border/60",
              "focus-within:bg-surface focus-within:border-brand-edge focus-within:ring-2 focus-within:ring-brand-soft",
              "transition-colors",
            )}
          >
            <Search size={11} className="absolute left-2.5 text-muted-foreground/60" />
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
                "flex-1 bg-transparent border-0 outline-none",
                "pl-7 pr-2 h-full text-[12px] text-foreground placeholder:text-muted-foreground/55",
              )}
            />
            {searchQuery ? (
              <button
                className="no-drag absolute right-1.5 inline-flex items-center justify-center size-4 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
              >
                <X size={9} />
              </button>
            ) : (
              <Kbd className="no-drag absolute right-1.5 h-4 min-w-4 px-1 text-[9px] font-mono opacity-70">
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
                "relative px-1 pb-1",
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
              className={cn(
                "no-drag inline-flex items-center justify-center size-5 rounded-[5px]",
                "text-muted-foreground/80 hover:text-foreground hover:bg-hover transition-colors",
              )}
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
              className={cn(
                "no-drag inline-flex items-center justify-center size-5 rounded-[5px]",
                "text-muted-foreground/80 hover:text-foreground hover:bg-hover transition-colors",
              )}
              aria-label="New workspace"
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          </HintTooltip>
        </SectionHeader>

        {/* Workspace tree */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div
              ref={setMainRootRef}
              className={cn(
                "relative px-1 pb-2",
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
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-hairline bg-rail/60 px-1.5 py-1.5 flex flex-col gap-1">
          <SidebarUpdateButton />
          <button
            type="button"
            onClick={toggleSettings}
            className={cn(
              "no-drag group/settings flex items-center gap-2 h-8 px-2 rounded-md",
              "text-[12px] text-foreground/75 hover:text-foreground hover:bg-hover",
              "transition-colors",
            )}
            title={`Settings (${resolveDisplayString("toggle-settings")})`}
          >
            <Settings size={13} strokeWidth={1.6} className="text-muted-foreground/80" />
            <span className="flex-1 text-left">Settings</span>
            <Kbd className="h-4 min-w-4 px-1 text-[9px] font-mono opacity-60 group-hover/settings:opacity-100 transition-opacity">
              {resolveDisplayString("toggle-settings")}
            </Kbd>
          </button>
        </div>

        {/* Resize handle (right edge) */}
        {sidebarOpen && (
          <div
            className={cn(
              "absolute top-0 right-0 bottom-0 w-1 cursor-col-resize",
              "hover:bg-brand/40 transition-colors",
              isResizing && "bg-brand/60",
            )}
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title="Delete workspace?"
          description="This workspace and all its tabs will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => {
            if (deleteTarget) removeWorkspace(deleteTarget);
          }}
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
    <div className="flex items-center justify-between px-3 pt-3 pb-1.5 select-none">
      <div className="inline-flex items-baseline gap-1.5">
        <span className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-muted-foreground/65">
          {label}
        </span>
        {typeof count === "number" ? (
          <span className="text-[9.5px] font-mono tabular-nums text-muted-foreground/45">
            {count}
          </span>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-px">{children}</div> : null}
    </div>
  );
}

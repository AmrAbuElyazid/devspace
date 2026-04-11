import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import "./sidebar.css";
import { useDroppable } from "@dnd-kit/core";
import { Plus, ChevronLeft, FolderClosed, Search, X, Settings } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspace-store";
import { useSettingsStore } from "../../store/settings-store";
import { resolveDisplayString } from "../../../shared/shortcuts";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { AlertDialog } from "../ui/alert-dialog";
import { useDragContext } from "../../hooks/useDndOrchestrator";
import { findSidebarNode } from "../../lib/sidebar-tree";
import { SidebarTreeLevel } from "./SidebarTreeLevel";
import { SidebarProvider, type SidebarContextValue } from "./SidebarContext";
import { QuickLaunchGrid } from "./QuickLaunchGrid";
import type { ContextMenuItem } from "../../../shared/types";
import type { SidebarContainer } from "../../types/dnd";

function clampSidebarWidth(width: number): number {
  return Math.max(160, Math.min(400, width));
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

  const { activeDrag, dropIntent } = useDragContext();

  const [searchQuery, setSearchQuery] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"workspace" | "folder" | null>(null);

  // Pick up pending edit requests from the store (e.g. from Cmd+N IPC)
  // Only handle workspace/folder renames — tab renames are handled by GroupTabBar.
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
      if (!cancelled) {
        setIsFullScreen(fullScreen);
      }
    });

    const unsubscribe = window.api.window.onFullScreenChange((fullScreen) => {
      setIsFullScreen(fullScreen);
    });

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
    if (!searchQuery.trim()) return null; // null = show all
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
        if (nodeCount === 0 && dropIntent.targetIndex === 0) {
          return "sidebar-insert-before";
        }
        if (dropIntent.targetIndex === nodeCount) {
          return "sidebar-insert-after";
        }
      }

      if (
        dropIntent?.kind === "create-workspace-from-tab" &&
        dropIntent.targetContainer === container &&
        dropIntent.targetParentFolderId === null
      ) {
        if (nodeCount === 0 && dropIntent.targetIndex === 0) {
          return "sidebar-insert-before";
        }
        if (dropIntent.targetIndex === nodeCount) {
          return "sidebar-insert-after";
        }
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
        if (nextWidth !== undefined) {
          setSidebarWidth(nextWidth);
        }
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
      <div
        className={`sidebar ${!sidebarOpen ? "sidebar-collapsed" : ""} ${isResizing ? "sidebar-resizing" : ""}`}
        style={
          sidebarOpen ? { width: renderedSidebarWidth, minWidth: renderedSidebarWidth } : undefined
        }
      >
        {/* Header — drag region with traffic light space + branding */}
        <div
          className="sidebar-header drag-region"
          data-fullscreen={isFullScreen ? "true" : undefined}
        >
          <span className="sidebar-wordmark no-drag">
            <span className="sidebar-wordmark-accent">dev</span>space
          </span>
          <button
            className="sidebar-collapse-btn no-drag"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            title={`Toggle sidebar (${resolveDisplayString("toggle-sidebar")})`}
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        {/* Quick launch grid */}
        <QuickLaunchGrid />

        {/* Search bar */}
        <div className="sidebar-search">
          <Search size={12} className="sidebar-search-icon" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
            aria-label="Search workspaces"
            className="sidebar-search-input no-drag"
          />
          {searchQuery ? (
            <button
              className="sidebar-search-clear no-drag"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <X size={10} />
            </button>
          ) : (
            <span className="sidebar-search-shortcut">/</span>
          )}
        </div>

        {/* Pinned section */}
        {pinnedSidebarNodes.length > 0 && (
          <>
            <div className="sidebar-section-divider" />
            <div className="sidebar-section-header">
              <span className="sidebar-label">Pinned</span>
            </div>
            <div
              ref={setPinnedRootRef}
              className={`sidebar-pinned-list ${isRelevantDrag && isPinnedRootOver ? "sidebar-item-drag-over-folder" : ""} ${pinnedRootInsertClass}`}
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

        {/* Section label + add buttons */}
        <div className="sidebar-section-divider" />
        <div className="sidebar-section-header">
          <span className="sidebar-label">Workspaces</span>
          <div className="flex items-center gap-0.5">
            <Tooltip content="New folder">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => addFolder("New Folder")}
                className="no-drag"
              >
                <FolderClosed size={12} />
              </Button>
            </Tooltip>
            <Tooltip content="New workspace" shortcut={resolveDisplayString("new-workspace")}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  if (defaultPaneType === "picker") {
                    useSettingsStore
                      .getState()
                      .openPanePicker({ action: "new-workspace", container: "main" });
                  } else {
                    addWorkspace(undefined, null, "main", defaultPaneType);
                  }
                }}
                className="no-drag"
              >
                <Plus size={13} />
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Sidebar tree with DnD */}
        <div className="sidebar-tree-root">
          <ScrollArea className="ws-list">
            <div
              ref={setMainRootRef}
              className={`sidebar-tree-content ${isRelevantDrag && isMainRootOver ? "sidebar-item-drag-over-folder" : ""} ${mainRootInsertClass}`}
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

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title="Delete workspace?"
          description="This workspace and all its tabs will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            if (deleteTarget) removeWorkspace(deleteTarget);
          }}
          variant="destructive"
        />

        {/* Footer — settings only */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-settings no-drag"
            onClick={toggleSettings}
            title={`Settings (${resolveDisplayString("toggle-settings")})`}
          >
            <Settings size={13} strokeWidth={1.8} />
            <span>Settings</span>
            <kbd className="sidebar-footer-shortcut">{resolveDisplayString("toggle-settings")}</kbd>
          </button>
        </div>

        {sidebarOpen && <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />}
      </div>
    </SidebarProvider>
  );
}

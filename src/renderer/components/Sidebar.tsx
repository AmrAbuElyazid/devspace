import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Plus,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FolderClosed,
  Search,
  X,
} from "lucide-react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useSettingsStore } from "../store/settings-store";
import { resolveDisplayString } from "../../shared/shortcuts";
import { useModifierHeldContext } from "../App";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { ScrollArea } from "./ui/scroll-area";
import { AlertDialog } from "./ui/alert-dialog";
import { InlineRenameInput } from "./ui/InlineRenameInput";
import { useInsertionIndicator } from "../hooks/useInsertionIndicator";
import type { ContextMenuItem } from "../../shared/types";
import type {
  SidebarNode,
  Workspace,
  Pane,
  PaneGroup,
  TerminalConfig,
  EditorConfig,
} from "../types/workspace";
import { useDragContext } from "../hooks/useDragAndDrop";
import type { SidebarContainer } from "../types/dnd";
import { findSidebarNode } from "../lib/sidebar-tree";

// ---------------------------------------------------------------------------
// Utility: format relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Utility: compute workspace metadata string
// ---------------------------------------------------------------------------

function getWorkspaceMetadata(
  ws: Workspace,
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
): string {
  const groupIds = collectGroupIds(ws.root);
  let paneCount = 0;
  let primaryDir = "";
  for (const gid of groupIds) {
    const group = paneGroups[gid];
    if (!group) continue;
    for (const tab of group.tabs) {
      const pane = panes[tab.paneId];
      if (!pane || pane.type === "empty") continue;
      paneCount++;
      if (!primaryDir && pane.type === "terminal") {
        const cwd = (pane.config as TerminalConfig).cwd;
        if (cwd) primaryDir = cwd.replace(/^\/Users\/[^/]+/, "~");
      }
      if (!primaryDir && pane.type === "editor") {
        const folder = (pane.config as EditorConfig).folderPath;
        if (folder) primaryDir = folder.replace(/^\/Users\/[^/]+/, "~");
      }
    }
  }
  const parts: string[] = [];
  if (paneCount > 0) parts.push(`${paneCount} pane${paneCount > 1 ? "s" : ""}`);
  if (primaryDir) parts.push(primaryDir);
  parts.push(formatRelativeTime(ws.lastActiveAt));
  return parts.join(" \u00b7 ");
}

// ---------------------------------------------------------------------------
// SortableWorkspaceItem
// ---------------------------------------------------------------------------

function SortableWorkspaceItem({
  workspaceId,
  container,
  parentFolderId,
  depth,
  isActive,
  isEditing,
  name,
  metadata,
  shortcutHint,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onContextMenu,
}: {
  workspaceId: string;
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isActive: boolean;
  isEditing: boolean;
  name: string;
  metadata: string;
  shortcutHint: string | null;
  onSelect: () => void;
  onStartEditing: () => void;
  onRename: (name: string) => void;
  onStopEditing: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { activeDrag } = useDragContext();
  const mergedRef = useRef<HTMLDivElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    isDragging,
    isOver,
  } = useSortable({
    id: `ws-${workspaceId}`,
    data: {
      type: "sidebar-workspace" as const,
      workspaceId,
      container,
      parentFolderId,
      visible: true,
    },
  });

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      mergedRef.current = el;
      setSortableRef(el);
    },
    [setSortableRef],
  );

  // Insertion line indicator — items stay in place, line shows where drop will go
  const isSidebarDrag =
    activeDrag?.type === "sidebar-workspace" || activeDrag?.type === "sidebar-folder";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isSidebarDrag,
    false,
    mergedRef,
    "vertical",
  );

  const isTabDropTarget =
    isOver &&
    !isDragging &&
    activeDrag?.type === "group-tab" &&
    activeDrag.workspaceId !== workspaceId;

  const style = {
    paddingLeft: depth * 16,
    opacity: isDragging ? 0.4 : undefined,
  };

  const insertClass =
    insertPosition === "before"
      ? "sidebar-insert-before"
      : insertPosition === "after"
        ? "sidebar-insert-after"
        : "";

  return (
    <div
      ref={setRef}
      style={style}
      data-sortable-id={`ws-${workspaceId}`}
      className={`ws-item no-drag ${isActive ? "ws-item-active" : ""} ${insertClass} ${isTabDropTarget ? "ws-item-tab-drop" : ""}`}
      onClick={() => {
        if (!isEditing) onSelect();
      }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <div className="ws-item-content">
        <div className="ws-item-row">
          <span
            className="ws-dot"
            style={{
              background: isActive ? "var(--accent)" : "var(--foreground-faint)",
            }}
          />
          {isEditing ? (
            <InlineRenameInput
              initialValue={name}
              onCommit={(newName) => {
                onRename(newName);
                onStopEditing();
              }}
              onCancel={onStopEditing}
              className="text-[13px]"
            />
          ) : (
            <span className="flex-1 truncate">{name}</span>
          )}
        </div>
        {!isEditing && metadata && <div className="ws-meta">{metadata}</div>}
      </div>
      {shortcutHint && <span className="ws-shortcut-hint">{shortcutHint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableFolderItem
// ---------------------------------------------------------------------------

function SortableFolderItem({
  folder,
  container,
  parentFolderId,
  depth,
  isEditing,
  editingId,
  editingType,
  filteredWorkspaceIds,
  onToggle,
  onStartEditingFolder,
  onStartEditingWorkspace,
  onRenameFolder,
  onRenameWorkspace,
  onStopEditing,
  onContextMenuFolder,
  onContextMenuWorkspace,
  onSelectWorkspace,
  activeWorkspaceId,
  workspaces,
  panes,
  paneGroups,
  toggleFolderCollapsed,
  deleteTarget,
  setDeleteTarget,
}: {
  folder: SidebarNode & { type: "folder" };
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isEditing: boolean;
  editingId: string | null;
  editingType: "workspace" | "folder" | null;
  filteredWorkspaceIds: Set<string> | null;
  onToggle: () => void;
  onStartEditingFolder: (id: string) => void;
  onStartEditingWorkspace: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onStopEditing: () => void;
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void;
  onSelectWorkspace: (id: string) => void;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
  toggleFolderCollapsed: (folderId: string) => void;
  deleteTarget: string | null;
  setDeleteTarget: (id: string | null) => void;
}) {
  const folderRef = useRef<HTMLDivElement | null>(null);

  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({
    id: `folder-${folder.id}`,
    data: {
      type: "sidebar-folder" as const,
      folderId: folder.id,
      container,
      parentFolderId,
      visible: true,
    },
  });

  const setFolderRef = useCallback(
    (el: HTMLDivElement | null) => {
      folderRef.current = el;
      setNodeRef(el);
    },
    [setNodeRef],
  );

  // Folder uses edge zones (0.25 threshold): edges show insertion line, center shows folder highlight
  const { activeDrag: activeDragCtx } = useDragContext();
  const isSidebarDrag =
    activeDragCtx?.type === "sidebar-workspace" || activeDragCtx?.type === "sidebar-folder";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isSidebarDrag,
    false,
    folderRef,
    "vertical",
    0.25,
  );

  // Show folder highlight only when pointer is in center zone (insertPosition === null means center)
  const showDragOver = isOver && !isDragging && isSidebarDrag && insertPosition === null;
  const insertClass =
    insertPosition === "before"
      ? "sidebar-insert-before"
      : insertPosition === "after"
        ? "sidebar-insert-after"
        : "";

  // When filtering, force folders expanded
  const isExpanded = filteredWorkspaceIds ? true : !folder.collapsed;

  return (
    <div style={{ opacity: isDragging ? 0.4 : undefined }}>
      <div
        ref={setFolderRef}
        data-sortable-id={`folder-${folder.id}`}
        className={`folder-header no-drag ${showDragOver ? "sidebar-item-drag-over-folder" : ""} ${insertClass}`}
        onClick={onToggle}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          paddingLeft: depth * 16 + 10,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: "0.03em",
          color: "var(--foreground-faint)",
          cursor: "pointer",
          userSelect: "none",
          marginTop: 4,
        }}
        {...attributes}
        {...listeners}
      >
        {!isExpanded ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        <FolderClosed size={12} style={{ opacity: 0.6 }} />
        {isEditing ? (
          <InlineRenameInput
            initialValue={folder.name}
            onCommit={(name) => {
              onRenameFolder(folder.id, name);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className="text-[12px]"
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}
      </div>

      {isExpanded && (
        <SidebarTreeLevel
          nodes={folder.children}
          container={container}
          parentFolderId={folder.id}
          depth={depth + 1}
          editingId={editingId}
          editingType={editingType}
          filteredWorkspaceIds={filteredWorkspaceIds}
          onStartEditingFolder={onStartEditingFolder}
          onStartEditingWorkspace={onStartEditingWorkspace}
          onRenameFolder={onRenameFolder}
          onRenameWorkspace={onRenameWorkspace}
          onStopEditing={onStopEditing}
          onContextMenuFolder={onContextMenuFolder}
          onContextMenuWorkspace={onContextMenuWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          panes={panes}
          paneGroups={paneGroups}
          toggleFolderCollapsed={toggleFolderCollapsed}
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarTreeLevel — recursive level renderer
// ---------------------------------------------------------------------------

export function SidebarTreeLevel({
  nodes,
  container,
  parentFolderId,
  depth,
  editingId,
  editingType,
  filteredWorkspaceIds,
  onStartEditingFolder,
  onStartEditingWorkspace,
  onRenameFolder,
  onRenameWorkspace,
  onStopEditing,
  onContextMenuFolder,
  onContextMenuWorkspace,
  onSelectWorkspace,
  activeWorkspaceId,
  workspaces,
  panes,
  paneGroups,
  toggleFolderCollapsed,
  deleteTarget,
  setDeleteTarget,
}: {
  nodes: SidebarNode[];
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  editingId: string | null;
  editingType: "workspace" | "folder" | null;
  filteredWorkspaceIds: Set<string> | null;
  onStartEditingFolder: (id: string) => void;
  onStartEditingWorkspace: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onStopEditing: () => void;
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void;
  onSelectWorkspace: (id: string) => void;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
  toggleFolderCollapsed: (folderId: string) => void;
  deleteTarget: string | null;
  setDeleteTarget: (id: string | null) => void;
}) {
  const sortableIds = nodes.map((n) =>
    n.type === "workspace" ? `ws-${n.workspaceId}` : `folder-${n.id}`,
  );
  const modifierHeld = useModifierHeldContext();

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => {
        if (node.type === "workspace") {
          // Skip if filtered out
          if (filteredWorkspaceIds && !filteredWorkspaceIds.has(node.workspaceId)) return null;
          const ws = workspaces.find((w) => w.id === node.workspaceId);
          if (!ws) return null;
          const metadata = getWorkspaceMetadata(ws, panes, paneGroups);
          // Show ⌘1-8 for first 8 workspaces, ⌘9 for the last (when index >= 8).
          // Workspaces at index 8+ that aren't last have no shortcut.
          const wsIndex = workspaces.indexOf(ws);
          const isLast = wsIndex === workspaces.length - 1;
          let shortcutHint: string | null = null;
          if (modifierHeld === "command" && wsIndex >= 0) {
            if (wsIndex < 8) {
              shortcutHint = `⌘${wsIndex + 1}`;
            } else if (isLast) {
              shortcutHint = "⌘9";
            }
          }
          return (
            <SortableWorkspaceItem
              key={`ws-${ws.id}`}
              workspaceId={ws.id}
              container={container}
              parentFolderId={parentFolderId}
              depth={depth}
              isActive={ws.id === activeWorkspaceId}
              isEditing={editingId === ws.id && editingType === "workspace"}
              name={ws.name}
              metadata={metadata}
              shortcutHint={shortcutHint}
              onSelect={() => onSelectWorkspace(ws.id)}
              onStartEditing={() => onStartEditingWorkspace(ws.id)}
              onRename={(name) => onRenameWorkspace(ws.id, name)}
              onStopEditing={onStopEditing}
              onContextMenu={(e) => onContextMenuWorkspace(e, ws.id)}
            />
          );
        }

        // folder node
        return (
          <SortableFolderItem
            key={`folder-${node.id}`}
            folder={node}
            container={container}
            parentFolderId={parentFolderId}
            depth={depth}
            isEditing={editingId === node.id && editingType === "folder"}
            editingId={editingId}
            editingType={editingType}
            filteredWorkspaceIds={filteredWorkspaceIds}
            onToggle={() => toggleFolderCollapsed(node.id)}
            onStartEditingFolder={onStartEditingFolder}
            onStartEditingWorkspace={onStartEditingWorkspace}
            onRenameFolder={onRenameFolder}
            onRenameWorkspace={onRenameWorkspace}
            onStopEditing={onStopEditing}
            onContextMenuFolder={onContextMenuFolder}
            onContextMenuWorkspace={onContextMenuWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
            panes={panes}
            paneGroups={paneGroups}
            toggleFolderCollapsed={toggleFolderCollapsed}
            deleteTarget={deleteTarget}
            setDeleteTarget={setDeleteTarget}
          />
        );
      })}
    </SortableContext>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
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
  const panes = useWorkspaceStore((s) => s.panes);
  const paneGroups = useWorkspaceStore((s) => s.paneGroups);
  const pendingEditId = useWorkspaceStore((s) => s.pendingEditId);
  const pendingEditType = useWorkspaceStore((s) => s.pendingEditType);
  const clearPendingEdit = useWorkspaceStore((s) => s.clearPendingEdit);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  const { activeDrag } = useDragContext();

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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

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
  const { setNodeRef: setPinnedRootRef, isOver: isPinnedRootOver } = useDroppable({
    id: "sidebar-root-pinned",
    data: { type: "sidebar-root" as const, container: "pinned", visible: true },
  });
  const { setNodeRef: setMainRootRef, isOver: isMainRootOver } = useDroppable({
    id: "sidebar-root-main",
    data: { type: "sidebar-root" as const, container: "main", visible: true },
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      setIsResizing(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = ev.clientX - resizeRef.current.startX;
        setSidebarWidth(resizeRef.current.startWidth + delta);
      };
      const onMouseUp = () => {
        setIsResizing(false);
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
      } else if (result === "add-workspace") addWorkspace(undefined, folderId, container);
      else if (result === "add-subfolder") addFolder("New Folder", folderId, container);
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
    ],
  );

  return (
    <div
      className={`sidebar ${!sidebarOpen ? "sidebar-collapsed" : ""} ${isResizing ? "sidebar-resizing" : ""}`}
      style={sidebarOpen ? { width: sidebarWidth, minWidth: sidebarWidth } : undefined}
    >
      {/* Header — drag region with traffic light space + branding */}
      <div className="sidebar-header drag-region">
        <span className="sidebar-label no-drag">DevSpace</span>
        <button
          className="sidebar-collapse-btn no-drag"
          onClick={toggleSidebar}
          title={`Toggle sidebar (${resolveDisplayString("toggle-sidebar")})`}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Search bar */}
      <div className="sidebar-search">
        <Search size={12} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder="Search workspaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchQuery("");
          }}
          className="sidebar-search-input no-drag"
        />
        {searchQuery && (
          <button className="sidebar-search-clear no-drag" onClick={() => setSearchQuery("")}>
            <X size={10} />
          </button>
        )}
      </div>

      {/* Pinned section */}
      {(pinnedSidebarNodes.length > 0 || isSidebarDrag) && (
        <>
          <div className="sidebar-section-header">
            <span className="sidebar-label">Pinned</span>
          </div>
          <div
            ref={setPinnedRootRef}
            className={`sidebar-pinned-list ${isSidebarDrag && isPinnedRootOver ? "sidebar-item-drag-over-folder" : ""}`}
          >
            <SidebarTreeLevel
              nodes={pinnedSidebarNodes}
              container="pinned"
              parentFolderId={null}
              depth={0}
              editingId={editingId}
              editingType={editingType}
              filteredWorkspaceIds={filteredWorkspaceIds}
              onStartEditingFolder={startEditingFolder}
              onStartEditingWorkspace={startEditingWorkspace}
              onRenameFolder={(id, name) => renameFolder(id, name)}
              onRenameWorkspace={(id, name) => renameWorkspace(id, name)}
              onStopEditing={stopEditing}
              onContextMenuFolder={handleFolderContextMenu}
              onContextMenuWorkspace={handleWorkspaceContextMenu}
              onSelectWorkspace={(id) => setActiveWorkspace(id)}
              activeWorkspaceId={activeWorkspaceId}
              workspaces={workspaces}
              panes={panes}
              paneGroups={paneGroups}
              toggleFolderCollapsed={toggleFolderCollapsed}
              deleteTarget={deleteTarget}
              setDeleteTarget={setDeleteTarget}
            />
          </div>
        </>
      )}

      {/* Section label + add buttons */}
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
              onClick={() => addWorkspace()}
              className="no-drag"
            >
              <Plus size={13} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Sidebar tree with DnD */}
      <div
        ref={setMainRootRef}
        className={isSidebarDrag && isMainRootOver ? "sidebar-item-drag-over-folder" : ""}
      >
        <ScrollArea className="ws-list">
          <SidebarTreeLevel
            nodes={sidebarTree}
            container="main"
            parentFolderId={null}
            depth={0}
            editingId={editingId}
            editingType={editingType}
            filteredWorkspaceIds={filteredWorkspaceIds}
            onStartEditingFolder={startEditingFolder}
            onStartEditingWorkspace={startEditingWorkspace}
            onRenameFolder={(id, name) => renameFolder(id, name)}
            onRenameWorkspace={(id, name) => renameWorkspace(id, name)}
            onStopEditing={stopEditing}
            onContextMenuFolder={handleFolderContextMenu}
            onContextMenuWorkspace={handleWorkspaceContextMenu}
            onSelectWorkspace={(id) => setActiveWorkspace(id)}
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
            panes={panes}
            paneGroups={paneGroups}
            toggleFolderCollapsed={toggleFolderCollapsed}
            deleteTarget={deleteTarget}
            setDeleteTarget={setDeleteTarget}
          />
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

      {/* Footer — gear icon */}
      <div
        className="sidebar-footer"
        style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}
      >
        <button
          onClick={() => useSettingsStore.getState().toggleSettings()}
          className="no-drag flex items-center justify-center rounded-md p-1 transition-colors"
          style={{ color: "var(--foreground-faint)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--foreground-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--foreground-faint)";
          }}
          title={`Settings (${resolveDisplayString("toggle-settings")})`}
        >
          <Settings size={15} />
        </button>
      </div>

      {sidebarOpen && <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />}
    </div>
  );
}

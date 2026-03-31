import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Plus,
  Settings,
  ChevronLeft,
  FolderClosed,
  Search,
  X,
  Terminal,
  Globe,
  FileCode,
  Bot,
  StickyNote,
  CircleHelp,
} from "lucide-react";
import { useWorkspaceStore, collectGroupIds } from "../../store/workspace-store";
import { useSettingsStore, type DefaultPaneType } from "../../store/settings-store";
import { resolveDisplayString } from "../../../shared/shortcuts";
import type { PaneType } from "../../types/workspace";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { AlertDialog } from "../ui/alert-dialog";
import { useDragContext } from "../../hooks/useDndOrchestrator";
import { findSidebarNode } from "../../lib/sidebar-tree";
import { SidebarTreeLevel } from "./SidebarTreeLevel";
import type { ContextMenuItem } from "../../../shared/types";
import type { SidebarContainer } from "../../types/dnd";

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
  const isRelevantDrag = isSidebarDrag || activeDrag?.type === "group-tab";
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
      {(pinnedSidebarNodes.length > 0 || isRelevantDrag) && (
        <>
          <div className="sidebar-section-header">
            <span className="sidebar-label">Pinned</span>
          </div>
          <div
            ref={setPinnedRootRef}
            className={`sidebar-pinned-list ${isRelevantDrag && isPinnedRootOver ? "sidebar-item-drag-over-folder" : ""}`}
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
      <div
        ref={setMainRootRef}
        className={`sidebar-tree-root ${isRelevantDrag && isMainRootOver ? "sidebar-item-drag-over-folder" : ""}`}
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

      {/* Footer — quick-create buttons + settings */}
      <SidebarFooter />

      {sidebarOpen && <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Footer — quick-create buttons + settings row
// ---------------------------------------------------------------------------

const quickCreateOptions: { type: PaneType; icon: typeof Terminal; label: string }[] = [
  { type: "terminal", icon: Terminal, label: "Terminal" },
  { type: "browser", icon: Globe, label: "Browser" },
  { type: "editor", icon: FileCode, label: "VS Code" },
  { type: "t3code", icon: Bot, label: "T3 Code" },
  { type: "note", icon: StickyNote, label: "Note" },
];

function SidebarFooter() {
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab);
  const toggleSettings = useSettingsStore((s) => s.toggleSettings);
  const [showHelp, setShowHelp] = useState(false);

  const handleQuickCreate = useCallback(
    (type: PaneType) => {
      // Quick create: add a tab of this type in the current workspace's focused group
      const wsState = useWorkspaceStore.getState();
      const ws = wsState.workspaces.find((w) => w.id === wsState.activeWorkspaceId);
      if (!ws) return;
      const gid = ws.focusedGroupId ?? collectGroupIds(ws.root)[0];
      if (gid) {
        addGroupTab(ws.id, gid, type);
      } else {
        addWorkspace(undefined, null, "main", type);
      }
    },
    [addGroupTab, addWorkspace],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: PaneType) => {
      e.preventDefault();
      const settings = useSettingsStore.getState();
      // Toggle: if already default, unset (→ picker mode). Otherwise set as default.
      const newDefault: DefaultPaneType = defaultPaneType === type ? "picker" : type;
      settings.updateSetting("defaultPaneType", newDefault);
    },
    [defaultPaneType],
  );

  return (
    <div className="sidebar-footer">
      {/* Row 1: Quick-create buttons + help */}
      <div className="sidebar-footer-qc-row">
        <div className="sidebar-footer-qc-buttons">
          {quickCreateOptions.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              className={`sidebar-qc-btn no-drag ${defaultPaneType === type ? "sidebar-qc-default" : ""}`}
              title={`${label}${defaultPaneType === type ? " (default for ⌘T)" : ""}`}
              onClick={() => handleQuickCreate(type)}
              onContextMenu={(e) => handleContextMenu(e, type)}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sidebar-help-btn no-drag"
          title="Quick-create help"
          onMouseEnter={() => setShowHelp(true)}
          onMouseLeave={() => setShowHelp(false)}
          onClick={() => setShowHelp((v) => !v)}
        >
          <CircleHelp size={12} />
          {showHelp && (
            <div className="sidebar-help-tooltip">
              <div>
                <strong>Click</strong> — create pane now
              </div>
              <div>
                <strong>Right-click</strong> — set as ⌘T default
              </div>
              <div>
                <strong>Right-click</strong> active — unset (use picker)
              </div>
              <div className="sidebar-help-divider" />
              <div>
                <span style={{ color: "var(--accent)" }}>●</span> Highlighted = ⌘T default
              </div>
              <div>No highlight = picker dialog on ⌘T</div>
            </div>
          )}
        </button>
      </div>

      {/* Row 2: Settings */}
      <button
        type="button"
        className="sidebar-footer-settings no-drag"
        onClick={toggleSettings}
        title={`Settings (${resolveDisplayString("toggle-settings")})`}
      >
        <Settings size={14} />
        <span>Settings</span>
        <span className="sidebar-footer-shortcut">{resolveDisplayString("toggle-settings")}</span>
      </button>
    </div>
  );
}

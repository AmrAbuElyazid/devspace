import { createContext, useContext, useEffect, useMemo } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useWorkspaceStore } from "./store/workspace-store";
import { useSettingsStore } from "./store/settings-store";
import { useTheme } from "./hooks/useTheme";
import { useDragAndDrop, DragContext } from "./hooks/useDragAndDrop";
import { useModifierHeld, type HeldModifier } from "./hooks/useModifierHeld";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useBrowserBridge } from "./hooks/useBrowserBridge";
import { useTerminalEvents } from "./hooks/useTerminalEvents";
import Sidebar from "./components/Sidebar";
import SplitLayout from "./components/SplitLayout";
import SettingsPage from "./components/SettingsPage";
import { ToastViewport } from "./components/ui/toast";
import { FolderClosed } from "lucide-react";
import { findFolder } from "./lib/sidebar-tree";

/** Context for which modifier key is currently held (for shortcut hint badges). */
const ModifierHeldContext = createContext<HeldModifier>(null);
export function useModifierHeldContext(): HeldModifier {
  return useContext(ModifierHeldContext);
}

export default function App() {
  useTheme();

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const keepVscodeServerRunning = useSettingsStore((s) => s.keepVscodeServerRunning);

  const dnd = useDragAndDrop();
  const { activeDrag, dropIntent } = dnd;
  const dragContextValue = useMemo(() => ({ activeDrag, dropIntent }), [activeDrag, dropIntent]);
  const modifierHeld = useModifierHeld();

  // ── Extracted hook subscriptions ─────────────────────────────────────
  useAppShortcuts();
  useBrowserBridge();
  useTerminalEvents();

  // Sync keepVscodeServerRunning to main process on mount and change.
  useEffect(() => {
    window.api?.editor?.setKeepServerRunning(keepVscodeServerRunning);
  }, [keepVscodeServerRunning]);

  // When a full-screen overlay (settings, dialog) is active, native views
  // must be hidden so the DOM overlay is visible. Also resign first
  // responder from any terminal so keyboard events flow to the DOM.
  const overlayCount = useSettingsStore((s) => s.overlayCount);
  const overlayActive = settingsOpen || overlayCount > 0;
  useEffect(() => {
    if (overlayActive) {
      void window.api.terminal.blur();
    }
  }, [overlayActive]);

  // Listen for CLI-triggered "open editor" requests from the main process.
  const openEditorTab = useWorkspaceStore((s) => s.openEditorTab);
  useEffect(() => {
    return window.api.window.onOpenEditor((folderPath) => {
      openEditorTab(folderPath);
    });
  }, [openEditorTab]);

  useEffect(() => {
    window.api.window.setSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  // ── Layout ───────────────────────────────────────────────────────────
  return (
    <ModifierHeldContext.Provider value={modifierHeld}>
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.onDragStart}
        onDragMove={dnd.onDragMove}
        onDragOver={dnd.onDragOver}
        onDragEnd={dnd.onDragEnd}
        onDragCancel={dnd.onDragCancel}
      >
        <DragContext.Provider value={dragContextValue}>
          <div className="app-shell" data-dragging={activeDrag ? "true" : undefined}>
            <Sidebar />
            <div className="app-main">
              <div className="app-content">
                {/* Render ALL workspaces stacked. Only the active workspace is visible.
                  Using visibility:hidden instead of display:none so native views
                  (xterm, WebContentsView) keep their canvas dimensions. */}
                {workspaces.map((ws) => {
                  const isVisible = ws.id === activeWorkspaceId;
                  return (
                    <div
                      key={ws.id}
                      className="app-workspace-layer"
                      data-active={isVisible || undefined}
                    >
                      <SplitLayout
                        node={ws.root}
                        workspaceId={ws.id}
                        overlayActive={overlayActive}
                        sidebarOpen={sidebarOpen}
                        dndEnabled={isVisible}
                      />
                    </div>
                  );
                })}

                {/* Settings overlay */}
                {settingsOpen && <SettingsPage />}
              </div>
            </div>
            <ToastViewport />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag?.type === "sidebar-workspace" &&
              (() => {
                const ws = workspaces.find((w) => w.id === activeDrag.workspaceId);
                return ws ? <div className="drag-overlay-workspace">{ws.name}</div> : null;
              })()}
            {activeDrag?.type === "sidebar-folder" &&
              (() => {
                const sidebarTree = useWorkspaceStore.getState().sidebarTree;
                const folder = findFolder(sidebarTree, activeDrag.folderId);
                return (
                  <div className="drag-overlay-folder">
                    <FolderClosed size={12} />
                    <span>{folder?.name ?? "Folder"}</span>
                  </div>
                );
              })()}
            {activeDrag?.type === "group-tab" &&
              (() => {
                const state = useWorkspaceStore.getState();
                const group = state.paneGroups[activeDrag.groupId];
                const tab = group?.tabs.find((t) => t.id === activeDrag.tabId);
                const pane = tab ? state.panes[tab.paneId] : null;
                return pane ? <div className="drag-overlay-tab">{pane.title}</div> : null;
              })()}
          </DragOverlay>
        </DragContext.Provider>
      </DndContext>
    </ModifierHeldContext.Provider>
  );
}

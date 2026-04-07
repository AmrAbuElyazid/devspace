import { createContext, useContext, useEffect, useMemo, memo } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useWorkspaceStore } from "./store/workspace-store";
import { useSettingsStore } from "./store/settings-store";
import { useNativeViewStore, initNativeViewSubscriptions } from "./store/native-view-store";
import { useTheme } from "./hooks/useTheme";
import { useDndOrchestrator, DragContext } from "./hooks/useDndOrchestrator";
import { useModifierHeld, type HeldModifier } from "./hooks/useModifierHeld";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useBrowserBridge } from "./hooks/useBrowserBridge";
import { useTerminalEvents } from "./hooks/useTerminalEvents";
import Sidebar from "./components/Sidebar";
import SplitLayout from "./components/SplitLayout";
import SettingsPage from "./components/SettingsPage";
import { PanePickerDialog } from "./components/PanePickerDialog";
import { ToastViewport } from "./components/ui/toast";
import { FolderClosed } from "lucide-react";
import { findFolder } from "./lib/sidebar-tree";

/** Context for which modifier key is currently held (for shortcut hint badges). */
const ModifierHeldContext = createContext<HeldModifier>(null);
export function useModifierHeldContext(): HeldModifier {
  return useContext(ModifierHeldContext);
}

// Initialize cross-store subscriptions once when the app module loads.
initNativeViewSubscriptions();

/**
 * Renders a single workspace layer.  Reads its own root from the store so
 * that changes to OTHER workspaces (rename, focus, CWD) don't re-render
 * this layer.
 */
const WorkspaceLayer = memo(function WorkspaceLayer({
  workspaceId,
  isActive,
  sidebarOpen,
}: {
  workspaceId: string;
  isActive: boolean;
  sidebarOpen: boolean;
}) {
  const root = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.root);
  if (!root) return null;
  return (
    <div className="app-workspace-layer" data-active={isActive || undefined}>
      <SplitLayout
        node={root}
        workspaceId={workspaceId}
        sidebarOpen={sidebarOpen}
        dndEnabled={isActive}
      />
    </div>
  );
});

export default function App() {
  useTheme();

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const keepVscodeServerRunning = useSettingsStore((s) => s.keepVscodeServerRunning);

  const dnd = useDndOrchestrator();
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

  // Sync drag state to NativeViewManager — during any drag that targets the
  // workspace area, all native views must be hidden so the DOM drag overlay
  // and drop zone indicators are visible above them.
  const setDragHidesViews = useNativeViewStore((s) => s.setDragHidesViews);
  useEffect(() => {
    const needsHide = activeDrag?.type === "group-tab" || activeDrag?.type === "sidebar-workspace";
    setDragHidesViews(needsHide);
  }, [activeDrag, setDragHidesViews]);

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
                {/* Only mount the active workspace layer so hidden work scales with
                  what is visible. Native panes survive workspace switches via the
                  per-pane session tracking in their own components. */}
                {activeWorkspaceId ? (
                  <WorkspaceLayer
                    key={activeWorkspaceId}
                    workspaceId={activeWorkspaceId}
                    isActive
                    sidebarOpen={sidebarOpen}
                  />
                ) : null}

                {/* Pane picker dialog */}
                <PanePickerDialog />
              </div>
            </div>
            {settingsOpen && <SettingsPage />}
            <ToastViewport />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag?.type === "sidebar-workspace" &&
              (() => {
                const ws = useWorkspaceStore
                  .getState()
                  .workspaces.find((w) => w.id === activeDrag.workspaceId);
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

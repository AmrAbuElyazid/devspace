import { createContext, useContext, useEffect, memo } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { FolderClosed } from "lucide-react";

import { useWorkspaceStore } from "./store/workspace-store";
import { useSettingsStore } from "./store/settings-store";
import { useNativeViewStore, initNativeViewSubscriptions } from "./store/native-view-store";
import { useTheme } from "./hooks/useTheme";
import { useActiveDrag, useDndOrchestrator } from "./hooks/useDndOrchestrator";
import { useModifierHeld, type HeldModifier } from "./hooks/useModifierHeld";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useBrowserBridge } from "./hooks/useBrowserBridge";
import { useTerminalEvents } from "./hooks/useTerminalEvents";

import Sidebar from "./components/Sidebar";
import SplitLayout from "./components/SplitLayout";
import SettingsPage from "./components/SettingsPage";
import { PanePickerDialog } from "./components/PanePickerDialog";

import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";

import { findFolder } from "./lib/sidebar-tree";
import { paneTypeIcons } from "./lib/pane-type-meta";

/** Context for which modifier key is currently held (for shortcut hint badges). */
const ModifierHeldContext = createContext<HeldModifier>(null);
export function useModifierHeldContext(): HeldModifier {
  return useContext(ModifierHeldContext);
}

initNativeViewSubscriptions();

/**
 * Renders a single workspace layer. Reads its own root from the store so
 * changes to OTHER workspaces (rename, focus, CWD) don't re-render this one.
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
    <div
      className="absolute inset-0 invisible z-0 data-[active=true]:visible data-[active=true]:z-[1]"
      data-active={isActive || undefined}
    >
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
  const activeDrag = useActiveDrag();
  const modifierHeld = useModifierHeld();

  useAppShortcuts();
  useBrowserBridge();
  useTerminalEvents();

  useEffect(() => {
    window.api?.editor?.setKeepServerRunning(keepVscodeServerRunning);
  }, [keepVscodeServerRunning]);

  // During pane-affecting drags, hide native views so DOM drop indicators
  // are visible above them.
  const setDragHidesViews = useNativeViewStore((s) => s.setDragHidesViews);
  useEffect(() => {
    const needsHide = activeDrag?.type === "group-tab" || activeDrag?.type === "sidebar-workspace";
    setDragHidesViews(needsHide);
  }, [activeDrag, setDragHidesViews]);

  const openEditorTab = useWorkspaceStore((s) => s.openEditorTab);
  useEffect(() => {
    return window.api.window.onOpenEditor((folderPath) => {
      openEditorTab(folderPath);
    });
  }, [openEditorTab]);

  useEffect(() => {
    window.api.window.setSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  return (
    <ModifierHeldContext.Provider value={modifierHeld}>
      <TooltipProvider delay={400}>
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={dnd.collisionDetection}
          onDragStart={dnd.onDragStart}
          onDragMove={dnd.onDragMove}
          onDragOver={dnd.onDragOver}
          onDragEnd={dnd.onDragEnd}
          onDragCancel={dnd.onDragCancel}
        >
          <div
            className="flex h-screen w-screen overflow-hidden bg-background text-foreground"
            data-dragging={activeDrag ? "true" : undefined}
          >
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-hidden">
              <div className="relative flex-1 overflow-hidden">
                {activeWorkspaceId ? (
                  <WorkspaceLayer
                    key={activeWorkspaceId}
                    workspaceId={activeWorkspaceId}
                    isActive
                    sidebarOpen={sidebarOpen}
                  />
                ) : null}
                <PanePickerDialog />
              </div>
            </main>
            {settingsOpen && <SettingsPage />}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag?.type === "sidebar-workspace" &&
              (() => {
                const ws = useWorkspaceStore
                  .getState()
                  .workspaces.find((w) => w.id === activeDrag.workspaceId);
                return ws ? <div className="drag-overlay-pill">{ws.name}</div> : null;
              })()}
            {activeDrag?.type === "sidebar-folder" &&
              (() => {
                const sidebarTree = useWorkspaceStore.getState().sidebarTree;
                const folder = findFolder(sidebarTree, activeDrag.folderId);
                return (
                  <div className="drag-overlay-pill">
                    <FolderClosed className="size-3.5 text-muted-foreground" />
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
                if (!pane) return null;
                const Icon = paneTypeIcons[pane.type];
                return (
                  <div className="drag-overlay-pill">
                    {Icon ? <Icon width={12} height={12} className="text-brand" /> : null}
                    <span>{pane.title}</span>
                  </div>
                );
              })()}
          </DragOverlay>
        </DndContext>

        <Toaster
          position="bottom-right"
          offset={16}
          gap={8}
          toastOptions={{
            classNames: {
              toast:
                "!bg-popover !text-popover-foreground !border !border-border !shadow-[var(--overlay-shadow)] !rounded-lg !text-[12px] !font-sans",
              title: "!text-[12px] !font-medium",
              description: "!text-[11px] !text-muted-foreground",
            },
          }}
        />
      </TooltipProvider>
    </ModifierHeldContext.Provider>
  );
}

import {
  memo,
  useRef,
  useCallback,
  useEffect,
  lazy,
  Suspense,
  Component,
  type ReactElement,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { useDroppable } from "@dnd-kit/core";
import { paneTypeIcons, paneTypeLabels } from "../lib/pane-type-meta";
import { useWorkspaceStore, getTopLeftGroupId } from "../store/workspace-store";
import { useNativeViewStore } from "../store/native-view-store";
import { useDragContext } from "../hooks/useDndOrchestrator";
import GroupTabBar from "./GroupTabBar";
import type {
  PaneType,
  Pane,
  PaneGroupTab,
  TerminalConfig,
  EditorConfig,
  BrowserConfig,
  NoteConfig,
} from "../types/workspace";

// Import the actual pane content components
import TerminalPane from "./TerminalPane";
import EditorPane from "./EditorPane";
import BrowserPane from "./BrowserPane";
import T3CodePane from "./T3CodePane";

// Lazy-load NotePane so Plate/editor deps are in a separate chunk
const NotePane = lazy(() => import("./note/NotePane"));

/** Error boundary to prevent Plate crashes from taking down the whole app */
class NotePaneErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NotePane] Render error:", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 8,
            color: "var(--foreground-faint)",
            fontSize: 13,
            padding: 20,
            textAlign: "center",
          }}
        >
          <span>Note editor failed to load</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{this.state.error.message}</span>
          <button
            type="button"
            style={{
              marginTop: 8,
              padding: "4px 12px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Lightweight placeholder shown over panes whose native view is hidden during drag. */
function DragPlaceholder({ pane }: { pane: Pane }): ReactElement {
  const Icon = paneTypeIcons[pane.type];
  const label = pane.title || paneTypeLabels[pane.type] || pane.type;
  return (
    <div className="pane-drag-placeholder">
      {Icon && <Icon size={24} />}
      <span>{label}</span>
    </div>
  );
}
function PaneContentDropZone({
  groupId,
  workspaceId,
  enabled,
  previewSide,
}: {
  groupId: string;
  workspaceId: string;
  enabled: boolean;
  previewSide: "left" | "right" | "top" | "bottom" | null;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `pane-drop-${groupId}`,
    disabled: !enabled,
    data: { type: "pane-drop", workspaceId, groupId, visible: enabled },
  });

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      zoneRef.current = el;
      setNodeRef(el);
    },
    [setNodeRef],
  );

  return (
    <div
      ref={mergedRef}
      className="pane-drop-zone-overlay"
      style={{ pointerEvents: enabled ? "auto" : "none" }}
      data-drop-zone={groupId}
    >
      {isOver && previewSide && <div className={`pane-drop-zone-half ${previewSide}`} />}
    </div>
  );
}

/**
 * Renders a single tab layer.  Each TabLayer has its own selector for the
 * pane data it needs, so a title change on one pane only re-renders its own
 * layer — not every PaneGroupContainer in the app.
 */
const TabLayer = memo(function TabLayer({
  tab,
  isActiveTab,
  workspaceId,
  isFocused,
  dragHidesViews,
  hasDragOverlay,
}: {
  tab: PaneGroupTab;
  isActiveTab: boolean;
  workspaceId: string;
  isFocused: boolean;
  dragHidesViews: boolean;
  hasDragOverlay: boolean;
}): ReactElement | null {
  const pane = useWorkspaceStore((s) => s.panes[tab.paneId]);
  if (!pane) return null;

  const showDragPlaceholder = isActiveTab && dragHidesViews && hasDragOverlay;

  return (
    <div className="pane-tab-layer" data-active={isActiveTab || undefined}>
      <PaneContent
        paneId={tab.paneId}
        paneType={pane.type}
        paneConfig={pane.config}
        workspaceId={workspaceId}
        isFocused={isFocused}
      />
      {showDragPlaceholder && <DragPlaceholder pane={pane} />}
    </div>
  );
});

interface PaneGroupContainerProps {
  groupId: string;
  workspaceId: string;
  sidebarOpen: boolean;
  dndEnabled: boolean;
}

// Memoized inner component that renders the right content based on pane type
const PaneContent = memo(function PaneContent({
  paneId,
  paneType,
  paneConfig,
  workspaceId,
  isFocused,
}: {
  paneId: string;
  paneType: PaneType;
  paneConfig: unknown;
  workspaceId: string;
  isFocused: boolean;
}): ReactElement {
  switch (paneType) {
    case "terminal":
      return (
        <TerminalPane
          paneId={paneId}
          config={(paneConfig as TerminalConfig) ?? {}}
          isFocused={isFocused}
        />
      );
    case "editor":
      return (
        <EditorPane
          paneId={paneId}
          config={(paneConfig as EditorConfig) ?? {}}
          isFocused={isFocused}
        />
      );
    case "browser":
      return (
        <BrowserPane
          paneId={paneId}
          workspaceId={workspaceId}
          config={(paneConfig as BrowserConfig) ?? { url: "https://www.google.com" }}
          isFocused={isFocused}
        />
      );
    case "t3code":
      return <T3CodePane paneId={paneId} isFocused={isFocused} />;
    case "note":
      return (
        <NotePaneErrorBoundary>
          <Suspense
            fallback={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--foreground-faint)",
                  fontSize: 13,
                }}
              >
                Loading editor...
              </div>
            }
          >
            <NotePane paneId={paneId} config={(paneConfig as NoteConfig) ?? { noteId: "" }} />
          </Suspense>
        </NotePaneErrorBoundary>
      );
  }
});

export default memo(function PaneGroupContainer({
  groupId,
  workspaceId,
  sidebarOpen,
  dndEnabled,
}: PaneGroupContainerProps): ReactElement | null {
  const group = useWorkspaceStore((s) => s.paneGroups[groupId]);
  const topLeftGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    return ws ? getTopLeftGroupId(ws.root) : null;
  });
  const isTopLeftGroup = !sidebarOpen && groupId === topLeftGroupId;
  const focusedGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    return ws?.focusedGroupId ?? null;
  });
  const setFocusedGroup = useWorkspaceStore((s) => s.setFocusedGroup);

  const { activeDrag, dropIntent } = useDragContext();
  const isFocused = focusedGroupId === groupId;
  const dragHidesViews = useNativeViewStore((s) => s.dragHidesViews);
  const hasDragOverlay =
    activeDrag?.type === "group-tab" || activeDrag?.type === "sidebar-workspace";
  const previewSide =
    dropIntent?.kind === "split-group" && dropIntent.targetGroupId === groupId
      ? dropIntent.side
      : dropIntent?.kind === "split-with-workspace" && dropIntent.targetGroupId === groupId
        ? dropIntent.side
        : null;

  const handleFocus = useCallback(() => {
    setFocusedGroup(workspaceId, groupId);
  }, [setFocusedGroup, workspaceId, groupId]);

  // Auto-repair: if group not found, create one
  useEffect(() => {
    if (!group) {
      console.warn(`[PaneGroupContainer] Group "${groupId}" not found — this shouldn't happen`);
    }
  }, [group, groupId]);

  if (!group) return null;

  return (
    <div
      className={`pane-group${isFocused ? " pane-group-focused" : ""}`}
      onMouseDown={handleFocus}
    >
      <GroupTabBar
        group={group}
        groupId={groupId}
        workspaceId={workspaceId}
        isFocused={isFocused}
        isTopLeftGroup={isTopLeftGroup}
        dndEnabled={dndEnabled}
      />
      <div className="pane-group-content">
        {hasDragOverlay && (
          <PaneContentDropZone
            groupId={groupId}
            workspaceId={workspaceId}
            enabled={dndEnabled}
            previewSide={previewSide}
          />
        )}
        {(() => {
          const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);
          if (!activeTab) {
            return null;
          }

          return (
            <TabLayer
              key={activeTab.paneId}
              tab={activeTab}
              isActiveTab={true}
              workspaceId={workspaceId}
              isFocused={isFocused}
              dragHidesViews={dragHidesViews}
              hasDragOverlay={hasDragOverlay}
            />
          );
        })()}
      </div>
    </div>
  );
});

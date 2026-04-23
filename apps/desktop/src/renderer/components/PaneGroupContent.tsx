import {
  Component,
  Suspense,
  lazy,
  memo,
  useCallback,
  useRef,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { useDroppable } from "@dnd-kit/core";

import { paneTypeIcons, paneTypeLabels } from "../lib/pane-type-meta";
import { useWorkspaceStore } from "../store/workspace-store";
import type {
  BrowserConfig,
  EditorConfig,
  NoteConfig,
  Pane,
  PaneGroupTab,
  PaneType,
  TerminalConfig,
} from "../types/workspace";
import BrowserPane from "./BrowserPane";
import EditorPane from "./EditorPane";
import T3CodePane from "./T3CodePane";
import TerminalPane from "./TerminalPane";

const NotePane = lazy(() => import("./note/NotePane"));

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
            <NotePane
              paneId={paneId}
              config={(paneConfig as NoteConfig) ?? { noteId: "" }}
              isFocused={isFocused}
            />
          </Suspense>
        </NotePaneErrorBoundary>
      );
  }
});

const TabLayer = memo(function TabLayer({
  tab,
  workspaceId,
  isFocused,
  showDragPlaceholder,
}: {
  tab: PaneGroupTab;
  workspaceId: string;
  isFocused: boolean;
  showDragPlaceholder: boolean;
}): ReactElement | null {
  const pane = useWorkspaceStore((s) => s.panes[tab.paneId]);
  if (!pane) return null;

  return (
    <div className="pane-tab-layer" data-active>
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

interface PaneGroupContentProps {
  activeTab: PaneGroupTab | null;
  dragHidesViews: boolean;
  dndEnabled: boolean;
  groupId: string;
  hasDragOverlay: boolean;
  isFocused: boolean;
  previewSide: "left" | "right" | "top" | "bottom" | null;
  workspaceId: string;
}

export default memo(function PaneGroupContent({
  activeTab,
  dragHidesViews,
  dndEnabled,
  groupId,
  hasDragOverlay,
  isFocused,
  previewSide,
  workspaceId,
}: PaneGroupContentProps): ReactElement {
  return (
    <div className="pane-group-content">
      {hasDragOverlay && (
        <PaneContentDropZone
          groupId={groupId}
          workspaceId={workspaceId}
          enabled={dndEnabled}
          previewSide={previewSide}
        />
      )}
      {activeTab ? (
        <TabLayer
          key={activeTab.paneId}
          tab={activeTab}
          workspaceId={workspaceId}
          isFocused={isFocused}
          showDragPlaceholder={dragHidesViews && hasDragOverlay}
        />
      ) : null}
    </div>
  );
});

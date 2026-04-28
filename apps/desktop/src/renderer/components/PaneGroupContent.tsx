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

import { paneTypeIcons, paneTypeLabels } from "@/lib/pane-type-meta";
import { syncWorkspaceFocusForPane } from "@/lib/native-pane-focus";
import { useWorkspaceStore } from "@/store/workspace-store";
import type {
  BrowserConfig,
  EditorConfig,
  NoteConfig,
  Pane,
  PaneGroupTab,
  PaneType,
  TerminalConfig,
} from "@/types/workspace";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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
        <div className="flex flex-col items-center justify-center h-full gap-2 p-5 text-center text-muted-foreground">
          <span className="text-[13px] text-foreground">Note editor failed to load</span>
          <span className="text-[11px] opacity-60 max-w-md">{this.state.error.message}</span>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PanePlaceholder({ pane, message }: { pane: Pane; message?: string }): ReactElement {
  const Icon = paneTypeIcons[pane.type];
  const label = pane.title || paneTypeLabels[pane.type] || pane.type;

  return (
    <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-background pointer-events-none">
      {Icon ? <Icon width={28} height={28} className="opacity-25" /> : null}
      <span className="text-[12px] font-medium text-muted-foreground/70">{label}</span>
      {message ? (
        <span className="text-[10.5px] font-mono text-muted-foreground/60">{message}</span>
      ) : null}
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
      className="absolute inset-0 z-[10]"
      style={{ pointerEvents: enabled ? "auto" : "none" }}
      data-drop-zone={groupId}
    >
      {isOver && previewSide ? <div className={cn("drop-half", previewSide)} /> : null}
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
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground/70 text-[12px]">
                <Spinner className="size-3.5" />
                Loading editor…
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
  showLeaderPlaceholder,
}: {
  tab: PaneGroupTab;
  workspaceId: string;
  isFocused: boolean;
  showDragPlaceholder: boolean;
  showLeaderPlaceholder: boolean;
}): ReactElement | null {
  const pane = useWorkspaceStore((s) => s.panes[tab.paneId]);
  if (!pane) return null;

  const handleActivate = useCallback(() => {
    syncWorkspaceFocusForPane(tab.paneId);
  }, [tab.paneId]);

  return (
    <div
      data-active
      onMouseDownCapture={handleActivate}
      onFocusCapture={handleActivate}
      className="absolute inset-0 hidden data-[active]:block z-[1]"
    >
      <PaneContent
        paneId={tab.paneId}
        paneType={pane.type}
        paneConfig={pane.config}
        workspaceId={workspaceId}
        isFocused={isFocused}
      />
      {showDragPlaceholder ? <PanePlaceholder pane={pane} /> : null}
      {!showDragPlaceholder && showLeaderPlaceholder ? (
        <PanePlaceholder pane={pane} message="Leader active — enter a Devspace shortcut" />
      ) : null}
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
  temporarilyHiddenPaneId: string | null;
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
  temporarilyHiddenPaneId,
  workspaceId,
}: PaneGroupContentProps): ReactElement {
  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-background">
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
          showLeaderPlaceholder={temporarilyHiddenPaneId === activeTab.paneId}
        />
      ) : null}
    </div>
  );
});

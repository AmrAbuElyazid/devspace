import { useEffect, useRef, useCallback } from "react";
import { useNativeView } from "../hooks/useNativeView";
import { useWorkspaceStore } from "../store/workspace-store";
import { useTerminalStore } from "../store/terminal-store";
import TerminalFindBar from "./terminal/TerminalFindBar";
import type { TerminalConfig } from "../types/workspace";
import type { ReactElement } from "react";

// Module-level tracking of created surfaces.  This survives React remounts
// (e.g. when a split changes the parent tree structure and the component
// gets unmounted from the old parent and remounted inside an Allotment).
// Without this, every remount would call terminal.create() again for the
// same surfaceId, creating duplicate native views and leaking the old one.
const createdSurfaces = new Set<string>();

/** Call when a surface is destroyed externally (pane-cleanup). */
export function markSurfaceDestroyed(surfaceId: string): void {
  createdSurfaces.delete(surfaceId);
}

interface TerminalPaneProps {
  paneId: string;
  config: TerminalConfig;
  isFocused: boolean;
}

export default function TerminalPane({
  paneId,
  config,
  isFocused,
}: TerminalPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const isFindBarOpen = useTerminalStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const findBarFocusToken = useTerminalStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const searchState = useTerminalStore((s) => s.searchStateByPaneId[paneId]);
  const closeFindBar = useTerminalStore((s) => s.closeFindBar);

  // Centralized native view management — replaces the old show/hide effect
  // and useTerminalBounds hook.
  const { isVisible } = useNativeView({
    id: paneId,
    type: "terminal",
    ref: placeholderRef,
  });

  // Create the native surface on mount — but only if it doesn't already exist.
  // The module-level createdSurfaces set persists across React remounts.
  useEffect(() => {
    if (createdSurfaces.has(paneId)) return;
    createdSurfaces.add(paneId);

    void window.api.terminal.create(paneId, config.cwd ? { cwd: config.cwd } : undefined);
  }, [paneId, config.cwd]);

  // Auto-focus when this pane becomes visible AND is the focused pane,
  // but NOT when the find bar is open (keyboard focus belongs to the input).
  useEffect(() => {
    if (!createdSurfaces.has(paneId) || !isVisible || !isFocused) return;
    if (isFindBarOpen) return;
    void window.api.terminal.focus(paneId);
  }, [isVisible, isFocused, paneId, isFindBarOpen]);

  // When the find bar opens, blur the native terminal so the DOM input can
  // receive keyboard focus. Without this, the GhosttyView holds macOS first
  // responder and DOM focus() calls are ignored.
  useEffect(() => {
    if (isFindBarOpen) {
      void window.api.terminal.blur();
    }
  }, [isFindBarOpen]);

  // Listen for title changes
  useEffect(() => {
    return window.api.terminal.onTitleChanged((surfaceId, title) => {
      if (surfaceId === paneId) {
        updatePaneTitle(paneId, title);
      }
    });
  }, [paneId, updatePaneTitle]);

  // Listen for surface closed (process exited)
  useEffect(() => {
    return window.api.terminal.onClosed((surfaceId) => {
      if (surfaceId === paneId) {
        createdSurfaces.delete(paneId);
      }
    });
  }, [paneId]);

  // Focus the surface when this pane is clicked
  const handleFocus = useCallback(() => {
    if (createdSurfaces.has(paneId)) {
      void window.api.terminal.focus(paneId);
    }
  }, [paneId]);

  const handleCloseFindBar = useCallback(() => {
    closeFindBar(paneId);
    void window.api.terminal.sendBindingAction(paneId, "end_search");
    // Re-focus the terminal after closing the find bar
    void window.api.terminal.focus(paneId);
  }, [closeFindBar, paneId]);

  return (
    <div className="terminal-pane-shell w-full h-full">
      {isFindBarOpen && (
        <TerminalFindBar
          paneId={paneId}
          focusToken={findBarFocusToken}
          totalMatches={searchState?.total ?? 0}
          selectedMatch={searchState?.selected ?? -1}
          onClose={handleCloseFindBar}
        />
      )}
      <div
        ref={placeholderRef}
        className="terminal-native-view-slot flex-1 min-h-0"
        data-native-view-hidden={!isVisible ? "true" : undefined}
        onMouseDown={handleFocus}
      />
    </div>
  );
}

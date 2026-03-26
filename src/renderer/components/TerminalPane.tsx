import { useEffect, useRef, useCallback } from "react";
import { useTerminalBounds } from "../hooks/useTerminalBounds";
import { useWorkspaceStore } from "../store/workspace-store";
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
  isVisible: boolean;
  hideNativeView: boolean;
  isFocused: boolean;
}

export default function TerminalPane({
  paneId,
  config,
  isVisible,
  hideNativeView,
  isFocused,
}: TerminalPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  const shouldShowNativeView = isVisible && !hideNativeView;

  // Track bounds and send to main process.
  // The native addon uses show-when-ready: the surface only becomes visible
  // when BOTH show has been called AND setBounds has been called at least once.
  // This eliminates the race where show fires before bounds are set.
  useTerminalBounds({
    surfaceId: paneId,
    enabled: shouldShowNativeView,
    ref: placeholderRef,
  });

  // Create the native surface on mount — but only if it doesn't already exist.
  // The module-level createdSurfaces set persists across React remounts.
  useEffect(() => {
    if (createdSurfaces.has(paneId)) return;
    createdSurfaces.add(paneId);

    void window.api.terminal.create(paneId, config.cwd ? { cwd: config.cwd } : undefined);
  }, [paneId, config.cwd]);

  // Show/hide based on visibility.
  // The native addon's show-when-ready pattern ensures the surface only
  // actually appears after setBounds has been called at least once.
  useEffect(() => {
    if (!createdSurfaces.has(paneId)) return;
    const action = shouldShowNativeView ? window.api.terminal.show : window.api.terminal.hide;
    void action(paneId);
  }, [shouldShowNativeView, paneId]);

  // Auto-focus when this pane becomes visible AND is the focused pane.
  // This handles tab switches: the previously-focused terminal in the
  // new tab automatically receives keyboard focus.
  useEffect(() => {
    if (!createdSurfaces.has(paneId) || !shouldShowNativeView || !isFocused) return;
    void window.api.terminal.focus(paneId);
  }, [shouldShowNativeView, isFocused, paneId]);

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

  return (
    <div
      ref={placeholderRef}
      className="terminal-native-view-slot w-full h-full"
      data-native-view-hidden={!shouldShowNativeView ? "true" : undefined}
      onMouseDown={handleFocus}
    />
  );
}

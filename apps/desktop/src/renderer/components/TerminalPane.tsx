import { useEffect, useRef, useCallback, useState, useLayoutEffect } from "react";
import { useNativeView } from "../hooks/useNativeView";
import { useTerminalStore } from "../store/terminal-store";
import {
  hasCreatedTerminalSurface,
  markTerminalSurfaceCreated,
  markTerminalSurfaceDestroyed,
} from "../lib/terminal-surface-session";
import TerminalFindBar from "./terminal/TerminalFindBar";
import type { TerminalConfig } from "../types/workspace";
import type { ReactElement } from "react";

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
  const createAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const isFindBarOpen = useTerminalStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const findBarFocusToken = useTerminalStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const searchState = useTerminalStore((s) => s.searchStateByPaneId[paneId]);
  const closeFindBar = useTerminalStore((s) => s.closeFindBar);
  const [createError, setCreateError] = useState<string | null>(null);
  const [surfaceReady, setSurfaceReady] = useState(() => hasCreatedTerminalSurface(paneId));

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Queue native creation during layout so the create IPC is in flight before
  // useNativeView's registration effect can reconcile visibility.
  useLayoutEffect(() => {
    if (surfaceReady) {
      return;
    }

    if (hasCreatedTerminalSurface(paneId)) {
      setSurfaceReady(true);
      return;
    }

    const attemptId = ++createAttemptRef.current;
    markTerminalSurfaceCreated(paneId);
    setSurfaceReady(true);

    void window.api.terminal
      .create(paneId, config.cwd ? { cwd: config.cwd } : undefined)
      .then((result) => {
        if (unmountedRef.current || createAttemptRef.current !== attemptId) {
          return;
        }

        if ("error" in result) {
          markTerminalSurfaceDestroyed(paneId);
          setCreateError(result.error);
          return;
        }

        setCreateError(null);
      })
      .catch((error: unknown) => {
        if (unmountedRef.current || createAttemptRef.current !== attemptId) {
          return;
        }

        markTerminalSurfaceDestroyed(paneId);
        setCreateError(error instanceof Error ? error.message : String(error));
      });
  }, [config.cwd, paneId, surfaceReady]);

  // Centralized native view management. Registration is gated on
  // `surfaceReady` so that `reconcile()` → `setVisibleSurfaces` never fires
  // for a surface whose `create` IPC hasn't been sent yet.
  const { isVisible } = useNativeView({
    id: paneId,
    type: "terminal",
    ref: placeholderRef,
    enabled: surfaceReady && createError === null,
  });

  // Auto-focus when this pane becomes visible AND is the focused pane,
  // but NOT when the find bar is open (keyboard focus belongs to the input).
  useEffect(() => {
    if (createError || !hasCreatedTerminalSurface(paneId) || !isVisible || !isFocused) return;
    if (isFindBarOpen) return;
    void window.api.terminal.focus(paneId);
  }, [createError, isVisible, isFocused, paneId, isFindBarOpen]);

  // When the find bar opens, blur the native terminal so the DOM input can
  // receive keyboard focus. Without this, the GhosttyView holds macOS first
  // responder and DOM focus() calls are ignored.
  useEffect(() => {
    if (isFindBarOpen) {
      void window.api.terminal.blur();
    }
  }, [isFindBarOpen]);

  const handleRetryCreate = useCallback(() => {
    markTerminalSurfaceDestroyed(paneId);
    setSurfaceReady(false);
    setCreateError(null);
  }, [paneId]);

  const handleCloseFindBar = useCallback(() => {
    closeFindBar(paneId);
    void window.api.terminal.sendBindingAction(paneId, "end_search");
    // Re-focus the terminal after closing the find bar
    if (isVisible && hasCreatedTerminalSurface(paneId)) {
      void window.api.terminal.focus(paneId);
    }
  }, [closeFindBar, isVisible, paneId]);

  if (createError) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-center">
        <div className="max-w-sm text-sm" style={{ color: "var(--muted-foreground)" }}>
          <div className="font-medium" style={{ color: "var(--foreground)" }}>
            Terminal failed to start
          </div>
          <div className="mt-2">{createError}</div>
          <button
            className="mt-4 rounded px-3 py-1.5 text-sm"
            style={{
              background: "var(--surface)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
            }}
            onClick={handleRetryCreate}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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
        className="flex-1 min-h-0"
        data-native-view-hidden={!isVisible ? "true" : undefined}
      />
    </div>
  );
}

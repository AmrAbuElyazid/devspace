import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useNativeView } from "@/hooks/useNativeView";
import { useTerminalStore } from "@/store/terminal-store";
import { focusTerminalNativePane } from "@/lib/native-pane-focus";
import {
  getTerminalSurfaceSnapshot,
  hasCreatedTerminalSurface,
  markTerminalSurfaceActive,
  markTerminalSurfaceCreated,
  markTerminalSurfaceDestroyed,
  markTerminalSurfaceFailed,
  markTerminalSurfaceInactive,
  markTerminalSurfaceReady,
  subscribeTerminalSurface,
} from "@/lib/terminal-surface-session";
import type { TerminalConfig } from "@/types/workspace";

import { Button } from "@/components/ui/button";

import TerminalFindBar from "./terminal/TerminalFindBar";

interface TerminalPaneProps {
  paneId: string;
  config: TerminalConfig;
  isFocused: boolean;
  isActive?: boolean;
}

export default function TerminalPane({
  paneId,
  config,
  isFocused,
  isActive = true,
}: TerminalPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const isFindBarOpen = useTerminalStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const findBarFocusToken = useTerminalStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const searchState = useTerminalStore((s) => s.searchStateByPaneId[paneId]);
  const closeFindBar = useTerminalStore((s) => s.closeFindBar);
  const subscribeToSurface = useCallback(
    (listener: () => void) => subscribeTerminalSurface(paneId, listener),
    [paneId],
  );
  const readSurface = useCallback(() => getTerminalSurfaceSnapshot(paneId), [paneId]);
  const surface = useSyncExternalStore(subscribeToSurface, readSurface, readSurface);
  const surfaceReady = surface.phase === "ready";
  const createError =
    surface.phase === "error" || surface.phase === "closed" ? surface.error : null;
  const sessionClosed = surface.phase === "closed";

  useEffect(() => {
    return () => {
      markTerminalSurfaceInactive(paneId, (surfaceId) => {
        void window.api.terminal.destroy(surfaceId);
      });
    };
  }, [paneId]);

  useEffect(() => {
    if (!isActive) {
      markTerminalSurfaceInactive(paneId, (surfaceId) => {
        void window.api.terminal.destroy(surfaceId);
      });
      return;
    }

    markTerminalSurfaceActive(paneId);
  }, [isActive, paneId, surface.phase]);

  // Queue native creation during layout so the create IPC is in flight before
  // useNativeView's registration effect can reconcile visibility.
  useLayoutEffect(() => {
    if (!isActive || surface.phase !== "missing" || hasCreatedTerminalSurface(paneId)) return;

    const generation = markTerminalSurfaceCreated(paneId, config.backend ?? "direct");

    const createOptions =
      config.backend === "managed-tmux"
        ? { backend: config.backend, sessionId: config.sessionId, cwd: config.cwd }
        : config.backend === "external-tmux"
          ? {
              backend: config.backend,
              sessionName: config.sessionName,
              socketPath: config.socketPath,
              cwd: config.cwd,
            }
          : config.cwd
            ? { backend: "direct" as const, cwd: config.cwd }
            : { backend: "direct" as const };

    void window.api.terminal
      .create(paneId, createOptions)
      .then((result) => {
        if ("error" in result) {
          markTerminalSurfaceFailed(paneId, generation, result.error);
          return;
        }

        markTerminalSurfaceReady(
          paneId,
          (surfaceId) => {
            void window.api.terminal.destroy(surfaceId);
          },
          generation,
        );
      })
      .catch((error: unknown) => {
        markTerminalSurfaceFailed(
          paneId,
          generation,
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [config, isActive, paneId, surface.phase]);

  // Centralized native view management. Registration is gated on
  // `surfaceReady` so that `reconcile()` → `setVisibleSurfaces` never fires
  // for a surface whose `create` IPC hasn't been sent yet.
  const { isVisible } = useNativeView({
    id: paneId,
    type: "terminal",
    ref: placeholderRef,
    enabled: surfaceReady && createError === null,
  });

  // Auto-focus on meaningful focus transitions only. Re-running focus on every
  // render adds unnecessary first-responder churn and can make stale terminal
  // sizing harder to reason about.
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    const wasFocused = wasFocusedRef.current;
    wasVisibleRef.current = isVisible;
    wasFocusedRef.current = isFocused;

    if (createError || !hasCreatedTerminalSurface(paneId) || !isVisible || !isFocused) return;
    if (isFindBarOpen) return;
    if (wasVisible && wasFocused) return;
    focusTerminalNativePane(paneId);
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
  }, [paneId]);

  const handleCloseFindBar = useCallback(() => {
    closeFindBar(paneId);
    void window.api.terminal.sendBindingAction(paneId, "end_search");
    // Re-focus the terminal after closing the find bar
    if (isVisible && hasCreatedTerminalSurface(paneId)) {
      focusTerminalNativePane(paneId);
    }
  }, [closeFindBar, isVisible, paneId]);

  if (createError) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-start gap-3 max-w-md p-5 rounded-lg bg-card border border-border shadow-[var(--overlay-shadow)]">
          <div className="inline-flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-[0.12em] text-destructive">
            <AlertTriangle size={11} />
            {sessionClosed ? "Terminal closed" : "Terminal error"}
          </div>
          <div className="text-[14px] font-medium text-foreground leading-snug">
            {sessionClosed ? "Terminal session ended" : "Terminal failed to start"}
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed self-stretch">
            {createError}
          </p>
          <Button size="sm" onClick={handleRetryCreate} className="mt-1">
            <RefreshCw size={12} data-icon="inline-start" />
            {sessionClosed ? "Restart" : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-background">
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
        className="flex-1 min-h-0 data-[hidden=true]:invisible"
        data-hidden={!isVisible ? "true" : undefined}
      />
    </div>
  );
}

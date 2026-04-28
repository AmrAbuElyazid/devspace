import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useLayoutEffect,
  type ReactElement,
} from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useNativeView } from "@/hooks/useNativeView";
import { useTerminalStore } from "@/store/terminal-store";
import { focusTerminalNativePane } from "@/lib/native-pane-focus";
import {
  hasCreatedTerminalSurface,
  markTerminalSurfaceCreated,
  markTerminalSurfaceDestroyed,
} from "@/lib/terminal-surface-session";
import type { TerminalConfig } from "@/types/workspace";

import { Button } from "@/components/ui/button";

import TerminalFindBar from "./terminal/TerminalFindBar";

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
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
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
    setSurfaceReady(false);
    setCreateError(null);
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
            Terminal error
          </div>
          <div className="text-[14px] font-medium text-foreground leading-snug">
            Terminal failed to start
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed self-stretch">
            {createError}
          </p>
          <Button size="sm" onClick={handleRetryCreate} className="mt-1">
            <RefreshCw size={12} data-icon="inline-start" />
            Retry
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

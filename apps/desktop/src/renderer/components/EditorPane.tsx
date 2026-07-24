import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { AlertCircle } from "lucide-react";

import { focusBrowserNativePane, hasEditableRendererFocus } from "@/lib/native-pane-focus";
import { useNativeView } from "@/hooks/useNativeView";
import { useSettingsStore } from "@/store/settings-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { EditorConfig } from "@/types/workspace";
import {
  getEmbeddedToolViewSnapshot,
  markEmbeddedToolViewActive,
  markEmbeddedToolViewCreated,
  markEmbeddedToolViewDestroyed,
  markEmbeddedToolViewFailed,
  markEmbeddedToolViewInactive,
  markEmbeddedToolViewReady,
  subscribeEmbeddedToolView,
} from "@/lib/embedded-tool-view-session";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Call when an editor pane is destroyed externally. */
export function markEditorDestroyed(paneId: string): void {
  markEmbeddedToolViewDestroyed(paneId);
}

interface EditorPaneProps {
  paneId: string;
  config: EditorConfig;
  isFocused: boolean;
  isActive?: boolean;
}

type EditorState =
  | { status: "checking" }
  | { status: "starting"; folderPath?: string | undefined }
  | { status: "running"; folderPath?: string | undefined }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export default function EditorPane({
  paneId,
  config,
  isFocused,
  isActive = true,
}: EditorPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const previousCliPathRef = useRef<string | null>(null);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const vscodeCliPath = useSettingsStore((s) => s.vscodeCliPath);
  const subscribeToView = useCallback(
    (listener: () => void) => subscribeEmbeddedToolView(paneId, listener),
    [paneId],
  );
  const readViewSession = useCallback(() => getEmbeddedToolViewSnapshot(paneId), [paneId]);
  const viewSession = useSyncExternalStore(subscribeToView, readViewSession, readViewSession);

  // Determine initial state based on config
  const [state, setState] = useState<EditorState>(() => {
    if (viewSession.phase === "ready") {
      return { status: "running", folderPath: config.folderPath };
    }
    if (viewSession.phase === "error") {
      return { status: "error", message: viewSession.error ?? "VS Code failed to start" };
    }
    // Skip availability check if we already have a folder (e.g. opened via CLI)
    if (config.folderPath) {
      return { status: "starting", folderPath: config.folderPath };
    }
    // Check availability first, then start immediately
    return { status: "checking" };
  });

  // Centralized native view management — only register once the
  // WebContentsView actually exists (status === "running").
  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: state.status === "running" && viewSession.phase === "ready",
  });

  // Check availability on mount, then immediately transition to starting
  useEffect(() => {
    if (state.status !== "checking") return;
    let cancelled = false;
    void window.api.editor.isAvailable(vscodeCliPath).then((available) => {
      if (cancelled) return;
      if (!available) {
        setState({ status: "unavailable" });
      } else {
        setState({ status: "starting", folderPath: config.folderPath });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.status, config.folderPath, vscodeCliPath]);

  // Extract values for effect dependency arrays (avoids depending on
  // the entire `state` object which is a new reference on every setState).
  const stateStatus = state.status;
  const stateFolderPath = "folderPath" in state ? state.folderPath : undefined;

  useEffect(() => {
    if (viewSession.phase === "ready" && stateStatus !== "running") {
      setState({ status: "running", folderPath: stateFolderPath ?? config.folderPath });
      return;
    }
    if (viewSession.phase === "error" && stateStatus !== "error") {
      setState({ status: "error", message: viewSession.error ?? "VS Code failed to start" });
      return;
    }
    if (viewSession.phase === "missing" && stateStatus === "running") {
      setState({ status: "starting", folderPath: stateFolderPath ?? config.folderPath });
    }
  }, [config.folderPath, stateFolderPath, stateStatus, viewSession.error, viewSession.phase]);

  useEffect(() => {
    return () => {
      markEmbeddedToolViewInactive(paneId);
    };
  }, [paneId]);

  useEffect(() => {
    if (!isActive) {
      markEmbeddedToolViewInactive(paneId);
      return;
    }

    markEmbeddedToolViewActive(paneId);
  }, [isActive, paneId, viewSession.phase]);

  useEffect(() => {
    if (previousCliPathRef.current === null) {
      previousCliPathRef.current = vscodeCliPath;
      return;
    }

    if (previousCliPathRef.current === vscodeCliPath || state.status === "running") {
      previousCliPathRef.current = vscodeCliPath;
      return;
    }

    previousCliPathRef.current = vscodeCliPath;
    markEmbeddedToolViewDestroyed(paneId);
    setState(
      config.folderPath
        ? { status: "starting", folderPath: config.folderPath }
        : { status: "checking" },
    );
  }, [config.folderPath, paneId, state.status, vscodeCliPath]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    const wasFocused = wasFocusedRef.current;
    wasVisibleRef.current = isVisible;
    wasFocusedRef.current = isFocused;

    if (!isVisible || stateStatus !== "running" || hasEditableRendererFocus() || !isFocused) {
      return;
    }

    if (wasVisible && wasFocused) {
      return;
    }

    focusBrowserNativePane(paneId);
  }, [isFocused, isVisible, paneId, stateStatus]);

  // Start the VS Code server
  useEffect(() => {
    if (stateStatus !== "starting") return;
    if (viewSession.phase === "ready") {
      setState({ status: "running", folderPath: stateFolderPath });
      return;
    }
    if (viewSession.phase === "pending") return;
    if (viewSession.phase === "error") {
      setState({ status: "error", message: viewSession.error ?? "VS Code failed to start" });
      return;
    }

    let cancelled = false;
    const generation = markEmbeddedToolViewCreated(paneId, () => {
      void window.api.browser.destroy(paneId);
    });

    void (async () => {
      const result = await window.api.editor.start(paneId, stateFolderPath, vscodeCliPath);

      if ("error" in result) {
        markEmbeddedToolViewFailed(paneId, generation, result.error);
        if (!cancelled) setState({ status: "error", message: result.error });
        return;
      }

      markEmbeddedToolViewReady(paneId, generation);
      if (cancelled) return;

      if (stateFolderPath) {
        const folderName = stateFolderPath.split("/").pop() || stateFolderPath;
        updatePaneTitle(paneId, `VC: ${folderName}`);
        updatePaneConfig(paneId, { folderPath: stateFolderPath });
      } else {
        updatePaneTitle(paneId, "VS Code");
      }
      setState({ status: "running", folderPath: stateFolderPath });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    paneId,
    stateStatus,
    stateFolderPath,
    updatePaneConfig,
    updatePaneTitle,
    viewSession.error,
    viewSession.phase,
    vscodeCliPath,
  ]);

  // Retry on error
  const handleRetry = useCallback(() => {
    markEmbeddedToolViewDestroyed(paneId);
    setState({ status: "starting", folderPath: config.folderPath });
  }, [config.folderPath, paneId]);

  if (state.status === "unavailable") {
    return (
      <PaneStatusCard eyebrow="Editor unavailable" title="VS Code CLI not found" tone="warning">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Install <span className="text-foreground font-medium">Visual Studio Code</span>, set a
          custom CLI path in Settings, or run{" "}
          <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10.5px] text-foreground">
            Shell Command: Install &lsquo;code&rsquo; command in PATH
          </code>{" "}
          from the VS Code command palette.
        </p>
      </PaneStatusCard>
    );
  }

  if (state.status === "error") {
    return (
      <PaneStatusCard eyebrow="Editor error" title="VS Code failed to start" tone="error">
        <p className="text-[12px] text-muted-foreground leading-relaxed self-stretch">
          {state.message}
        </p>
        <Button size="sm" onClick={handleRetry}>
          Retry
        </Button>
      </PaneStatusCard>
    );
  }

  if (state.status === "checking" || state.status === "starting") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-background">
        <Spinner className="size-4 text-muted-foreground" />
        <p className="text-[11.5px] font-mono text-muted-foreground">starting vs code server…</p>
      </div>
    );
  }

  return (
    <div
      ref={placeholderRef}
      className="absolute inset-0 bg-background data-[hidden=true]:invisible"
      data-hidden={!isVisible ? "true" : undefined}
    />
  );
}

function PaneStatusCard({
  eyebrow,
  title,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: "warning" | "error";
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-start gap-3 max-w-md p-5 rounded-lg bg-card border border-border shadow-[var(--overlay-shadow)]">
        <div
          className={`inline-flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-[0.12em] ${
            tone === "error" ? "text-destructive" : "text-status-warning"
          }`}
        >
          <AlertCircle size={11} />
          {eyebrow}
        </div>
        <div className="text-[14px] font-medium text-foreground leading-snug">{title}</div>
        {children}
      </div>
    </div>
  );
}

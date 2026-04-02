import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { hasEditableRendererFocus } from "../lib/native-pane-focus";
import { useNativeView } from "../hooks/useNativeView";
import { useWorkspaceStore } from "../store/workspace-store";
import { Button } from "./ui/button";
import type { EditorConfig } from "../types/workspace";
import type { ReactElement } from "react";

// Module-level tracking to survive React remounts (same pattern as TerminalPane)
const startedEditors = new Set<string>();

/** Call when an editor pane is destroyed externally. */
export function markEditorDestroyed(paneId: string): void {
  startedEditors.delete(paneId);
}

interface EditorPaneProps {
  paneId: string;
  config: EditorConfig;
}

type EditorState =
  | { status: "checking" }
  | { status: "starting"; folderPath?: string | undefined }
  | { status: "running"; folderPath?: string | undefined }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export default function EditorPane({ paneId, config }: EditorPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  // Determine initial state based on config
  const [state, setState] = useState<EditorState>(() => {
    if (startedEditors.has(paneId)) {
      return { status: "running", folderPath: config.folderPath };
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
    enabled: state.status === "running",
  });

  // Check availability on mount, then immediately transition to starting
  useEffect(() => {
    if (state.status !== "checking") return;
    let cancelled = false;
    void window.api.editor.isAvailable().then((available) => {
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
  }, [state.status, config.folderPath]);

  // Extract values for effect dependency arrays (avoids depending on
  // the entire `state` object which is a new reference on every setState).
  const stateStatus = state.status;
  const stateFolderPath = "folderPath" in state ? state.folderPath : undefined;

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;

    if (!isVisible || wasVisible || stateStatus !== "running" || hasEditableRendererFocus()) {
      return;
    }

    void window.api.browser.setFocus(paneId);
  }, [isVisible, paneId, stateStatus]);

  // Start the VS Code server
  useEffect(() => {
    if (stateStatus !== "starting") return;
    if (startedEditors.has(paneId)) {
      setState({ status: "running", folderPath: stateFolderPath });
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await window.api.editor.start(paneId, stateFolderPath);

      if (cancelled) return;

      if ("error" in result) {
        setState({ status: "error", message: result.error });
        return;
      }

      startedEditors.add(paneId);
      if (stateFolderPath) {
        const folderName = stateFolderPath.split("/").pop() || stateFolderPath;
        updatePaneTitle(paneId, `VS Code: ${folderName}`);
        updatePaneConfig(paneId, { folderPath: stateFolderPath });
      } else {
        updatePaneTitle(paneId, "VS Code");
      }
      setState({ status: "running", folderPath: stateFolderPath });
    })();

    return () => {
      cancelled = true;
    };
  }, [paneId, stateStatus, stateFolderPath, updatePaneConfig, updatePaneTitle]);

  // Retry on error
  const handleRetry = useCallback(() => {
    setState({ status: "starting", folderPath: config.folderPath });
  }, [config.folderPath]);

  // Render states before the VS Code view is ready
  if (state.status === "unavailable") {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "var(--background)" }}
      >
        <AlertCircle size={48} style={{ color: "var(--destructive)", opacity: 0.6 }} />
        <p className="text-sm text-center max-w-xs" style={{ color: "var(--muted-foreground)" }}>
          VS Code CLI not found. Install <strong>Visual Studio Code</strong> and run{" "}
          <code className="px-1 py-0.5 rounded text-xs" style={{ background: "var(--surface)" }}>
            Shell Command: Install &apos;code&apos; command in PATH
          </code>{" "}
          from the VS Code command palette.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "var(--background)" }}
      >
        <AlertCircle size={48} style={{ color: "var(--destructive)", opacity: 0.6 }} />
        <p className="text-sm text-center max-w-xs" style={{ color: "var(--muted-foreground)" }}>
          {state.message}
        </p>
        <Button onClick={handleRetry}>Retry</Button>
      </div>
    );
  }

  if (state.status === "checking" || state.status === "starting") {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-3"
        style={{ backgroundColor: "var(--background)" }}
      >
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--muted-foreground)" }} />
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Starting VS Code server...
        </p>
      </div>
    );
  }

  // Running state — native view placeholder
  return (
    <div
      ref={placeholderRef}
      className="browser-native-view-slot"
      data-native-view-hidden={!isVisible ? "true" : undefined}
    />
  );
}

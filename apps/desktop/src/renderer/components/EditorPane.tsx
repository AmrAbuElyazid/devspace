import { useCallback, type ReactElement } from "react";

import { useEmbeddedWebPane, type EmbeddedWebPaneStartResult } from "@/hooks/useEmbeddedWebPane";
import { markEmbeddedToolViewDestroyed } from "@/lib/embedded-tool-view-session";
import { useSettingsStore } from "@/store/settings-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { EditorConfig } from "@/types/workspace";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PaneStatusCard } from "@/components/ui/pane-status-card";

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

export default function EditorPane({
  paneId,
  config,
  isFocused,
  isActive = true,
}: EditorPaneProps): ReactElement {
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const vscodeCliPath = useSettingsStore((s) => s.vscodeCliPath);
  const folderPath = config.folderPath;

  const checkAvailability = useCallback(
    () => window.api.editor.isAvailable(vscodeCliPath),
    [vscodeCliPath],
  );

  const start = useCallback(async (): Promise<EmbeddedWebPaneStartResult> => {
    const result = await window.api.editor.start(paneId, folderPath, vscodeCliPath);
    if ("cancelled" in result) return { cancelled: true };
    if ("error" in result) return { error: result.error };
    return { started: true };
  }, [folderPath, paneId, vscodeCliPath]);

  const onStarted = useCallback(() => {
    if (folderPath) {
      const folderName = folderPath.split("/").pop() || folderPath;
      updatePaneTitle(paneId, `VC: ${folderName}`);
      updatePaneConfig(paneId, { folderPath });
      return;
    }

    updatePaneTitle(paneId, "VS Code");
  }, [folderPath, paneId, updatePaneConfig, updatePaneTitle]);

  const { status, errorMessage, isVisible, placeholderRef, retry } = useEmbeddedWebPane({
    paneId,
    isFocused,
    isActive,
    defaultErrorMessage: "VS Code failed to start",
    // A pane opened on a folder (the CLI path, a restored session) has already
    // proved the CLI exists by getting here, so it skips straight to starting.
    needsAvailabilityCheck: !folderPath,
    checkAvailability,
    start,
    onStarted,
    restartKey: vscodeCliPath,
  });

  if (status === "unavailable") {
    return (
      <PaneStatusCard eyebrow="Editor unavailable" title="VS Code CLI not found" tone="warning">
        <p className="text-ui-sm text-muted-foreground leading-relaxed">
          Install <span className="text-foreground font-medium">Visual Studio Code</span>, set a
          custom CLI path in Settings, or run{" "}
          <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-ui-micro text-foreground">
            Shell Command: Install &lsquo;code&rsquo; command in PATH
          </code>{" "}
          from the VS Code command palette.
        </p>
      </PaneStatusCard>
    );
  }

  if (status === "error") {
    return (
      <PaneStatusCard eyebrow="Editor error" title="VS Code failed to start" tone="error">
        <p className="text-ui-sm text-muted-foreground leading-relaxed self-stretch">
          {errorMessage}
        </p>
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      </PaneStatusCard>
    );
  }

  if (status === "checking" || status === "starting") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-background">
        <Spinner className="size-4 text-muted-foreground" />
        <p className="text-ui-xs font-mono text-muted-foreground">starting vs code server…</p>
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

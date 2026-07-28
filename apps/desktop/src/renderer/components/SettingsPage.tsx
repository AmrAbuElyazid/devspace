import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Terminal,
  RotateCcw,
  Settings,
  Palette,
  SquareTerminal,
  Code,
  Globe,
  Keyboard,
  Search,
} from "lucide-react";

import { useSettingsStore } from "@/store/settings-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useAppUpdateState } from "@/hooks/useAppUpdateState";
import { cn } from "@/lib/utils";
import type { TerminalConfig } from "@/types/workspace";
import type { AppUpdateState, EditorCliStatus, ManagedTerminalSession } from "../../shared/types";
import { TITLE_BAR_HEIGHT_EXPANDED } from "../../shared/chrome";
import {
  SHORTCUT_CATEGORIES,
  getVisibleShortcutsForCategory,
  getNumberedGroupDisplayString,
  resolveShortcut,
  findConflict,
  type ShortcutAction,
  type StoredShortcut,
} from "../../shared/shortcuts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutRecorder } from "@/components/ui/shortcut-recorder";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import BrowserImportPanel from "./browser/BrowserImportPanel";

type SettingsSection = "general" | "appearance" | "terminal" | "editor" | "browser" | "shortcuts";

const NAV_ITEMS: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "editor", label: "Editor", icon: Code },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

const RELEASES_URL = "https://github.com/AmrAbuElyazid/devspace/releases";

/**
 * Settings is a centered modal card rather than a full-window page.
 *
 * The full-window version put its only close affordance in the top-right of
 * the *window*, a few pixels from the native red traffic light — people aimed
 * for one and hit the other. Everything that dismisses the panel now lives on
 * or immediately around the card: the header ✕, the footer Done button, a
 * click on the scrim, and Escape (handled globally in `useAppShortcuts`).
 */
export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const close = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

  const handleScrimMouseDown = useCallback(
    (event: React.MouseEvent) => {
      // Only a press that both starts and lands on the scrim itself counts —
      // a drag that began on a text selection inside the card must not close.
      if (event.target === event.currentTarget) close();
    },
    [close],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/70 backdrop-blur-md">
      {/* The scrim would otherwise swallow the whole title bar, leaving no way
          to move the window while settings is open. This strip stays draggable. */}
      <div className="drag-region shrink-0" style={{ height: TITLE_BAR_HEIGHT_EXPANDED }} />
      <div
        className="no-drag flex min-h-0 flex-1 justify-center px-6 pt-1 pb-8"
        onMouseDown={handleScrimMouseDown}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-overlay"
        >
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-border pr-2 pl-4">
            <h1 className="text-ui-lg font-medium text-foreground">Settings</h1>
            <button
              type="button"
              onClick={close}
              aria-label="Close settings"
              className="chrome-focus inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground"
            >
              <X size={14} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-rail/50 p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={active || undefined}
                    onClick={() => setActiveSection(item.id)}
                    className="chrome-row chrome-focus h-8 gap-2.5 px-2.5 text-left text-ui-sm"
                  >
                    <Icon
                      size={13}
                      className={cn("shrink-0", active ? "text-brand" : "text-muted-foreground")}
                    />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="min-h-0 min-w-0 flex-1">
              <ScrollArea className="h-full">
                <div className="px-8 py-6">
                  {activeSection === "general" && <GeneralSection />}
                  {activeSection === "appearance" && <AppearanceSection />}
                  {activeSection === "terminal" && <TerminalSection />}
                  {activeSection === "editor" && <EditorSection />}
                  {activeSection === "browser" && <BrowserSection />}
                  {activeSection === "shortcuts" && <ShortcutSettingsSection />}
                </div>
              </ScrollArea>
            </div>
          </div>

          <footer className="flex h-12 shrink-0 items-center justify-between border-t border-border px-4">
            <span className="text-ui-xs text-muted-foreground">Changes save as you make them.</span>
            <div className="flex items-center gap-2">
              <Kbd className="h-5 px-1.5 font-mono text-ui-micro">esc</Kbd>
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function GeneralSection() {
  const showShortcutHintsOnModifierPress = useSettingsStore(
    (s) => s.showShortcutHintsOnModifierPress,
  );
  const leaderTimeoutMs = useSettingsStore((s) => s.leaderTimeoutMs);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <section>
      <SectionTitle>General</SectionTitle>
      <SettingRow label="Shell command" description="Install the devspace CLI in your PATH.">
        <InstallCliButton />
      </SettingRow>
      <SettingRow label="Version & updates">
        <UpdatesPanel />
      </SettingRow>
      <SettingRow
        label="Show shortcut hints"
        description="Reveal ⌘ / ⌃ chips beside actions when the modifier is held."
      >
        <Switch
          checked={showShortcutHintsOnModifierPress}
          onCheckedChange={(value) => updateSetting("showShortcutHintsOnModifierPress", value)}
        />
      </SettingRow>
      <SettingRow
        label="Leader timeout"
        description="How long leader mode waits for a Devspace shortcut before restoring the pane."
      >
        <NumberInput
          value={leaderTimeoutMs}
          onChange={(value) => updateSetting("leaderTimeoutMs", value)}
          min={250}
          max={10000}
          step={250}
          suffix="ms"
        />
      </SettingRow>
    </section>
  );
}

function AppearanceSection() {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <section>
      <SectionTitle>Appearance</SectionTitle>
      <SettingRow label="Theme">
        <SegmentedControl
          options={[
            { label: "System", value: "system" as const },
            { label: "Dark", value: "dark" as const },
            { label: "Light", value: "light" as const },
          ]}
          value={themeMode}
          onChange={(v) => updateSetting("themeMode", v)}
        />
      </SettingRow>
      <SettingRow label="Font size">
        <NumberInput
          value={fontSize}
          onChange={(v) => updateSetting("fontSize", v)}
          min={10}
          max={24}
          suffix="px"
        />
      </SettingRow>
    </section>
  );
}

function TerminalSection() {
  const defaultShell = useSettingsStore((s) => s.defaultShell);
  const terminalScrollback = useSettingsStore((s) => s.terminalScrollback);
  const terminalCursorStyle = useSettingsStore((s) => s.terminalCursorStyle);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const [externalSessionName, setExternalSessionName] = useState("");
  const [externalSocketPath, setExternalSocketPath] = useState("");
  const [managedSessions, setManagedSessions] = useState<ManagedTerminalSession[]>([]);
  const [managedSessionError, setManagedSessionError] = useState<string | null>(null);
  /** Session id awaiting confirmation, or "all" for the bulk kill. */
  const [killTarget, setKillTarget] = useState<string | null>(null);
  const panes = useWorkspaceStore((state) => state.panes);
  const managedPaneSessionIds = useMemo(
    () =>
      Object.values(panes).flatMap((pane) =>
        pane.type === "terminal" && pane.config.backend === "managed-tmux"
          ? [pane.config.sessionId]
          : [],
      ),
    [panes],
  );
  const managedPaneSessionKey = managedPaneSessionIds.join(",");

  const refreshManagedSessions = useCallback(async () => {
    const result = await window.api.terminal.listManagedSessions();
    if ("error" in result) {
      setManagedSessionError(result.error);
      return;
    }
    setManagedSessionError(null);
    setManagedSessions(result.sessions);
  }, []);

  useEffect(() => {
    void refreshManagedSessions();
  }, [refreshManagedSessions, managedPaneSessionKey]);

  const managedPaneSessionIdSet = new Set(managedPaneSessionIds);
  const recoverableSessions = managedSessions.filter(
    (session) => !managedPaneSessionIdSet.has(session.sessionId),
  );

  const handleRecoverSession = useCallback((sessionId: string) => {
    const state = useWorkspaceStore.getState();
    const workspace = state.workspaces.find(
      (candidate) => candidate.id === state.activeWorkspaceId,
    );
    if (!workspace?.focusedGroupId) return;
    state.openManagedTerminalSession(workspace.id, workspace.focusedGroupId, sessionId);
  }, []);

  const killSessions = useCallback(
    async (sessionIds: string[]) => {
      for (const sessionId of sessionIds) {
        const result = await window.api.terminal.killManagedSession(sessionId);
        if ("error" in result) {
          setManagedSessionError(result.error);
          break;
        }
      }
      await refreshManagedSessions();
    },
    [refreshManagedSessions],
  );

  const confirmKill = useCallback(() => {
    if (!killTarget) return;
    const ids =
      killTarget === "all" ? recoverableSessions.map((session) => session.sessionId) : [killTarget];
    void killSessions(ids);
  }, [killSessions, killTarget, recoverableSessions]);

  const openTerminalWithConfig = useCallback(
    (config: TerminalConfig) => {
      const state = useWorkspaceStore.getState();
      const workspace = state.workspaces.find(
        (candidate) => candidate.id === state.activeWorkspaceId,
      );
      if (!workspace?.focusedGroupId) return;
      state.openTerminalWithConfig(workspace.id, workspace.focusedGroupId, config);
      setSettingsOpen(false);
    },
    [setSettingsOpen],
  );

  const handleAttachExternalTmux = useCallback(() => {
    const sessionName = externalSessionName.trim();
    const socketPath = externalSocketPath.trim();
    if (
      !sessionName ||
      sessionName.includes("\0") ||
      sessionName.includes("\r") ||
      sessionName.includes("\n") ||
      socketPath.includes("\0") ||
      socketPath.includes("\r") ||
      socketPath.includes("\n")
    ) {
      return;
    }
    openTerminalWithConfig({
      backend: "external-tmux",
      sessionName,
      ...(socketPath ? { socketPath } : {}),
    });
  }, [externalSessionName, externalSocketPath, openTerminalWithConfig]);

  return (
    <section>
      <SectionTitle>Terminal</SectionTitle>
      <SettingRow label="Default shell" description="Leave blank to inherit from your environment.">
        <TextInput
          value={defaultShell}
          onChange={(v) => updateSetting("defaultShell", v)}
          placeholder="auto-detect"
          width={180}
        />
      </SettingRow>
      <SettingRow label="Scrollback">
        <NumberInput
          value={terminalScrollback}
          onChange={(v) => updateSetting("terminalScrollback", v)}
          min={500}
          max={50000}
          step={500}
          suffix="lines"
        />
      </SettingRow>
      <SettingRow label="Cursor">
        <SegmentedControl
          options={[
            { label: "Block", value: "block" as const },
            { label: "Underline", value: "underline" as const },
            { label: "Bar", value: "bar" as const },
          ]}
          value={terminalCursorStyle}
          onChange={(v) => updateSetting("terminalCursorStyle", v)}
        />
      </SettingRow>
      <div className="mt-6 space-y-3 rounded-lg border border-border p-3">
        <div>
          <div className="text-ui-sm font-medium text-foreground">Terminal backends</div>
          <div className="mt-0.5 text-ui-micro leading-relaxed text-muted-foreground">
            New terminals use Devspace&apos;s isolated managed tmux server. Your own tmux server,
            configuration, and sessions remain separate.
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-xs text-foreground">Direct PTY</div>
            <div className="text-ui-micro text-muted-foreground">
              Compatibility mode; its process cannot be detached safely.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openTerminalWithConfig({ backend: "direct" })}
          >
            Open direct terminal
          </Button>
        </div>
        <Separator />
        <div>
          <div className="text-ui-xs text-foreground">Attach to your tmux</div>
          <div className="mt-0.5 text-ui-micro text-muted-foreground">
            Uses the tmux installed on your machine and never takes ownership of the session.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={externalSessionName}
            onChange={(event) => setExternalSessionName(event.target.value)}
            placeholder="session name"
            aria-label="External tmux session name"
            className="h-7 min-w-0 font-mono text-ui-xs"
          />
          <Input
            value={externalSocketPath}
            onChange={(event) => setExternalSocketPath(event.target.value)}
            placeholder="socket path (optional)"
            aria-label="External tmux socket path"
            className="h-7 min-w-0 font-mono text-ui-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!externalSessionName.trim()}
            onClick={handleAttachExternalTmux}
          >
            Attach
          </Button>
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div>
            <div className="text-ui-sm font-medium text-foreground">Detached sessions</div>
            <div className="mt-0.5 text-ui-micro text-muted-foreground">
              Closing a managed terminal tab keeps its processes alive until you recover or kill it.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void refreshManagedSessions()}>
              Refresh
            </Button>
            {recoverableSessions.length > 0 ? (
              <Button variant="destructive" size="sm" onClick={() => setKillTarget("all")}>
                Kill all
              </Button>
            ) : null}
          </div>
        </div>
        {managedSessionError ? (
          <div className="py-2 text-ui-xs text-destructive">{managedSessionError}</div>
        ) : recoverableSessions.length === 0 ? (
          <div className="rounded-md border border-border px-3 py-2.5 text-ui-xs text-muted-foreground">
            No detached managed sessions.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {recoverableSessions.map((session) => (
              <div key={session.sessionId} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-ui-xs">{session.sessionId}</div>
                  <div className="text-ui-micro text-muted-foreground">
                    {session.attachedClients > 0
                      ? `${session.attachedClients} attached client${session.attachedClients === 1 ? "" : "s"}`
                      : "detached"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRecoverSession(session.sessionId)}
                >
                  Open
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setKillTarget(session.sessionId)}
                >
                  Kill
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={killTarget !== null}
        onOpenChange={(open) => {
          if (!open) setKillTarget(null);
        }}
        title={
          killTarget === "all"
            ? `Kill ${recoverableSessions.length} detached session${recoverableSessions.length === 1 ? "" : "s"}?`
            : "Kill this detached session?"
        }
        description="Every process still running inside will be terminated. This cannot be undone."
        confirmLabel={killTarget === "all" ? "Kill all" : "Kill"}
        variant="destructive"
        onConfirm={confirmKill}
      />
    </section>
  );
}

function EditorSection() {
  const vscodeCliPath = useSettingsStore((s) => s.vscodeCliPath);
  const keepVscodeServerRunning = useSettingsStore((s) => s.keepVscodeServerRunning);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [editorCliStatus, setEditorCliStatus] = useState<EditorCliStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.editor.getCliStatus(vscodeCliPath).then((status) => {
      if (!cancelled) setEditorCliStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [vscodeCliPath]);

  return (
    <section>
      <SectionTitle>Editor</SectionTitle>
      <SettingRow label="Engine">
        <span className="font-mono text-ui-xs text-muted-foreground">VS Code (code serve-web)</span>
      </SettingRow>
      <SettingRow
        label="VS Code CLI"
        description="Blank prefers the VS Code app bundle, then `code` in PATH."
      >
        <div className="flex flex-col items-end gap-1.5">
          <TextInput
            value={vscodeCliPath}
            onChange={(v) => updateSetting("vscodeCliPath", v)}
            placeholder="auto-detect"
            width={260}
          />
          <EditorCliStatusText status={editorCliStatus} />
        </div>
      </SettingRow>
      <SettingRow
        label="Keep server running"
        description="Keeps a local VS Code server in the background for faster reopen."
      >
        <Switch
          checked={keepVscodeServerRunning}
          onCheckedChange={(v) => updateSetting("keepVscodeServerRunning", v)}
        />
      </SettingRow>
    </section>
  );
}

function BrowserSection() {
  return (
    <section>
      <SectionTitle>Browser</SectionTitle>
      <BrowserImportPanel />
    </section>
  );
}

function UpdatesPanel() {
  const state = useAppUpdateState();
  const checkForUpdates = useCallback(() => {
    void window.api.app.checkForUpdates();
  }, []);
  const installUpdate = useCallback(() => {
    void window.api.app.installUpdate();
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col items-end gap-1.5 text-right">
      <span className="font-mono text-ui-xs text-foreground">
        {state?.currentVersion ?? "loading…"}
      </span>
      <span
        className={cn(
          "text-right text-ui-xs",
          state?.status === "error"
            ? "text-destructive"
            : state?.status === "downloaded"
              ? "text-brand"
              : "text-muted-foreground",
        )}
      >
        {formatUpdateStatus(state)}
      </span>
      {state?.checkedAt ? (
        <span className="font-mono text-ui-micro text-muted-foreground">
          last checked {new Date(state.checkedAt).toLocaleString()}
        </span>
      ) : null}
      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
        <Button
          size="xs"
          variant="outline"
          onClick={checkForUpdates}
          disabled={
            !state?.enabled || state.status === "checking" || state.status === "downloading"
          }
        >
          {state?.status === "checking" ? "Checking…" : "Check for updates"}
        </Button>
        {state?.status === "downloaded" ? (
          <Button size="xs" onClick={installUpdate}>
            Restart to update
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => window.api.shell.openExternal(RELEASES_URL)}
        >
          View releases
        </Button>
      </div>
    </div>
  );
}

function formatUpdateStatus(state: AppUpdateState | null): string {
  if (!state) return "Checking update availability…";
  if (state.message) return state.message;
  switch (state.status) {
    case "disabled":
      return state.disabledReason ?? "Automatic updates are unavailable.";
    case "idle":
      return "Automatic update checks enabled.";
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Update ${state.availableVersion ?? "available"} found. Downloading…`;
    case "downloading":
      return `Downloading update${
        state.downloadPercent === null ? "…" : ` (${Math.round(state.downloadPercent)}%)…`
      }`;
    case "downloaded":
      return `Update ${state.availableVersion ?? ""} is ready to install.`.trim();
    case "up-to-date":
      return "You're up to date.";
    case "error":
      return "Update check failed.";
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function ShortcutSettingsSection() {
  const [overrides, setOverrides] = useState<Record<string, StoredShortcut>>({});
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void window.api.shortcuts.getAll().then(setOverrides);
    const unsub = window.api.shortcuts.onChanged(() => {
      void window.api.shortcuts.getAll().then(setOverrides);
    });
    return unsub;
  }, []);

  const overridesMap = new Map(Object.entries(overrides)) as Map<ShortcutAction, StoredShortcut>;

  const handleRecord = useCallback((action: ShortcutAction, shortcut: StoredShortcut | null) => {
    if (shortcut === null) {
      void window.api.shortcuts.reset(action);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[action];
        return next;
      });
      return;
    }
    void window.api.shortcuts.set(action, shortcut);
    setOverrides((prev) => ({ ...prev, [action]: shortcut }));
  }, []);

  const handleReset = useCallback((action: ShortcutAction) => {
    void window.api.shortcuts.reset(action);
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[action];
      return next;
    });
  }, []);

  const handleResetAll = useCallback(() => {
    void window.api.shortcuts.resetAll();
    setOverrides({});
  }, []);

  const hasAnyOverrides = Object.keys(overrides).length > 0;
  const filterLower = filter.toLowerCase();

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <SectionTitle className="mb-0">Keyboard shortcuts</SectionTitle>
        {hasAnyOverrides && (
          <Button size="xs" variant="ghost" onClick={handleResetAll}>
            <RotateCcw size={11} data-icon="inline-start" />
            Reset all
          </Button>
        )}
      </div>

      <div className="relative mb-4">
        <Search
          size={11}
          className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Filter shortcuts…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 pl-7 text-ui-sm"
        />
      </div>

      <div className="flex flex-col gap-5">
        {SHORTCUT_CATEGORIES.map((cat) => {
          const defs = getVisibleShortcutsForCategory(cat.id);
          const filteredDefs = filterLower
            ? defs.filter((d) => d.label.toLowerCase().includes(filterLower))
            : defs;
          if (filteredDefs.length === 0) return null;

          const numberedBase =
            cat.id === "workspaces" ? "select-workspace" : cat.id === "tabs" ? "select-tab" : null;

          return (
            <div key={cat.id}>
              <h3 className="mb-2 font-mono text-ui-micro tracking-[0.16em] uppercase text-muted-foreground">
                {cat.label}
              </h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {filteredDefs.map((def, i) => {
                  const current = resolveShortcut(def.action, overridesMap);
                  const conflict = findConflict(current, def.action, overridesMap);
                  const conflictText = conflict ? `Conflicts with ${conflict.label}` : undefined;
                  return (
                    <div
                      key={def.action}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3.5 py-2",
                        (i < filteredDefs.length - 1 || numberedBase) && "border-b border-border",
                      )}
                    >
                      <span className="text-ui-sm text-foreground">{def.label}</span>
                      <ShortcutRecorder
                        current={current}
                        defaultShortcut={def.defaultShortcut}
                        onRecord={(s) => handleRecord(def.action, s)}
                        onReset={() => handleReset(def.action)}
                        conflict={conflictText}
                      />
                    </div>
                  );
                })}

                {numberedBase &&
                  (!filterLower || `select ${cat.id.slice(0, -1)} 1-9`.includes(filterLower)) && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                      <span className="text-ui-sm text-foreground">
                        Select {cat.id === "workspaces" ? "workspace" : "tab"} 1…9
                      </span>
                      <Kbd className="h-5 px-1.5 font-mono text-ui-micro">
                        {getNumberedGroupDisplayString(numberedBase, overridesMap)}
                      </Kbd>
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function EditorCliStatusText({ status }: { status: EditorCliStatus | null }) {
  if (!status) return null;
  if (status.path !== null) {
    return (
      <span className="max-w-[260px] font-mono text-ui-micro break-all text-right text-muted-foreground">
        using {status.path} ({formatCliSource(status.source)})
      </span>
    );
  }
  if (status.reason === "configured-not-found") {
    return (
      <span className="max-w-[260px] font-mono text-ui-micro break-all text-right text-destructive">
        configured CLI not found: {status.attempted}
      </span>
    );
  }
  return <span className="font-mono text-ui-micro text-destructive">VS Code CLI not found.</span>;
}

function formatCliSource(source: Extract<EditorCliStatus, { path: string }>["source"]) {
  switch (source) {
    case "configured-path":
      return "configured path";
    case "configured-command":
      return "configured command";
    case "bundle":
      return "VS Code bundle";
    case "path":
      return "PATH";
  }
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("mb-5 text-ui-lg font-medium text-foreground", className)}>{children}</h2>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-6 py-3">
        <div className="flex min-w-0 max-w-[60%] flex-col gap-0.5">
          <Label className="text-ui-sm font-medium text-foreground">{label}</Label>
          {description ? (
            <span className="text-ui-xs leading-snug text-muted-foreground">{description}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start justify-end">{children}</div>
      </div>
      <Separator />
    </>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-px rounded-md border border-border bg-elevated/50 p-0.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "chrome-focus h-6 rounded px-2.5 text-ui-xs transition-colors",
              active
                ? "bg-brand-soft font-medium text-foreground"
                : "text-muted-foreground hover:bg-row-hover hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = useCallback(() => {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(min ?? parsed, Math.min(max ?? parsed, parsed));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }, [draft, max, min, onChange, value]);

  return (
    <div className="inline-flex items-center gap-1.5">
      <Input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        min={min}
        max={max}
        step={step}
        className="h-7 w-20 font-mono text-ui-xs"
      />
      {suffix ? (
        <span className="font-mono text-ui-micro text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  width = 160,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = useCallback(() => {
    if (draft !== value) onChange(draft);
  }, [draft, onChange, value]);

  return (
    <Input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      style={{ width }}
      className="h-7 font-mono text-ui-xs"
    />
  );
}

function InstallCliButton() {
  const [status, setStatus] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleInstall = async () => {
    setStatus("installing");
    try {
      const result = await window.api.cli.install();
      if (result.ok) setStatus("done");
      else {
        setErrorMsg(result.error ?? "Unknown error");
        setStatus("error");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <span className="font-mono text-ui-micro text-status-success">
        installed at /usr/local/bin/devspace
      </span>
    );
  }
  if (status === "error") {
    return <span className="max-w-[260px] text-right text-ui-xs text-destructive">{errorMsg}</span>;
  }
  return (
    <Button size="sm" variant="outline" onClick={handleInstall} disabled={status === "installing"}>
      <Terminal size={12} data-icon="inline-start" />
      {status === "installing" ? "Installing…" : "Install in PATH"}
    </Button>
  );
}

import { useState, useEffect, useCallback } from "react";
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
import { useAppUpdateState } from "@/hooks/useAppUpdateState";
import { cn } from "@/lib/utils";
import type { AppUpdateState, EditorCliStatus } from "../../shared/types";
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

export default function SettingsPage() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  useEffect(() => {
    let cancelled = false;
    void window.api.window.isFullScreen().then((fullScreen) => {
      if (!cancelled) setIsFullScreen(fullScreen);
    });
    const unsubscribe = window.api.window.onFullScreenChange(setIsFullScreen);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
    >
      {/* Header — drag region for the title bar */}
      <header
        className={cn(
          "drag-region flex items-center justify-between shrink-0 h-[52px] border-b border-hairline pr-3",
          isFullScreen ? "pl-3" : "pl-[88px]",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/80">
            Devspace
          </span>
          <span className="font-mono text-[10.5px] text-muted-foreground/40">/</span>
          <h1 className="text-[13px] font-medium text-foreground">Settings</h1>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          aria-label="Close settings"
          className="no-drag inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
        >
          <X size={14} />
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Side nav */}
        <nav
          className={cn(
            "shrink-0 flex flex-col gap-px py-3 pr-2",
            "border-r border-hairline bg-rail/40",
            isFullScreen ? "pl-3" : "pl-4",
          )}
          style={{ width: 196 }}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "no-drag relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] text-left",
                  "transition-colors",
                  active
                    ? "bg-brand-soft text-foreground before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-brand before:rounded-r-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-hover",
                )}
              >
                <Icon
                  size={13}
                  className={cn("shrink-0", active ? "text-brand" : "text-muted-foreground/70")}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="max-w-2xl mx-auto px-10 py-8">
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
        <span className="text-[11.5px] font-mono text-muted-foreground">
          VS Code (code serve-web)
        </span>
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
      <span className="font-mono text-[11.5px] text-foreground">
        {state?.currentVersion ?? "loading…"}
      </span>
      <span
        className={cn(
          "text-[11px] text-right",
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
        <span className="text-[10.5px] font-mono text-muted-foreground/70">
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
      <div className="flex items-center justify-between mb-5">
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
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70"
        />
        <Input
          placeholder="Filter shortcuts…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-7 h-8 text-[12px]"
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
              <h3 className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {cat.label}
              </h3>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {filteredDefs.map((def, i) => {
                  const current = resolveShortcut(def.action, overridesMap);
                  const conflict = findConflict(current, def.action, overridesMap);
                  const conflictText = conflict ? `Conflicts with ${conflict.label}` : undefined;
                  return (
                    <div
                      key={def.action}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3.5 py-2",
                        (i < filteredDefs.length - 1 || numberedBase) && "border-b border-hairline",
                      )}
                    >
                      <span className="text-[12.5px] text-foreground/85">{def.label}</span>
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
                      <span className="text-[12.5px] text-foreground/85">
                        Select {cat.id === "workspaces" ? "workspace" : "tab"} 1…9
                      </span>
                      <Kbd className="h-5 px-1.5 text-[10px] font-mono">
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
      <span className="text-[10.5px] font-mono text-muted-foreground break-all text-right max-w-[260px]">
        using {status.path} ({formatCliSource(status.source)})
      </span>
    );
  }
  if (status.reason === "configured-not-found") {
    return (
      <span className="text-[10.5px] font-mono text-destructive break-all text-right max-w-[260px]">
        configured CLI not found: {status.attempted}
      </span>
    );
  }
  return <span className="text-[10.5px] font-mono text-destructive">VS Code CLI not found.</span>;
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
    <h2 className={cn("text-[15px] font-medium text-foreground mb-5", className)}>{children}</h2>
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
        <div className="flex flex-col gap-0.5 min-w-0 max-w-[60%]">
          <Label className="text-[12.5px] font-medium text-foreground">{label}</Label>
          {description ? (
            <span className="text-[11px] text-muted-foreground leading-snug">{description}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start justify-end">{children}</div>
      </div>
      <Separator className="bg-hairline" />
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
    <div className="inline-flex items-center gap-px p-0.5 rounded-md bg-surface border border-border/70">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2.5 h-6 rounded text-[11.5px] transition-colors",
              active
                ? "bg-card text-foreground font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-muted-foreground hover:text-foreground",
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
        className="w-20 h-7 text-[11.5px] font-mono"
      />
      {suffix ? (
        <span className="text-[10.5px] font-mono text-muted-foreground">{suffix}</span>
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
      className="h-7 text-[11.5px] font-mono"
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
      <span className="text-[10.5px] font-mono text-status-success">
        installed at /usr/local/bin/devspace
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-[11px] text-destructive max-w-[260px] text-right">{errorMsg}</span>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={handleInstall} disabled={status === "installing"}>
      <Terminal size={12} data-icon="inline-start" />
      {status === "installing" ? "Installing…" : "Install in PATH"}
    </Button>
  );
}

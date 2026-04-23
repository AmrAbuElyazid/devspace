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
} from "lucide-react";
import { useSettingsStore } from "../store/settings-store";
import { Button } from "./ui/button";
import { ShortcutRecorder } from "./ui/shortcut-recorder";
import BrowserImportPanel from "./browser/BrowserImportPanel";
import type { EditorCliStatus } from "../../shared/types";
import {
  SHORTCUT_CATEGORIES,
  getVisibleShortcutsForCategory,
  getNumberedGroupDisplayString,
  resolveShortcut,
  findConflict,
  type ShortcutAction,
  type StoredShortcut,
} from "../../shared/shortcuts";

type SettingsSection = "general" | "appearance" | "terminal" | "editor" | "browser" | "shortcuts";

const NAV_ITEMS: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "editor", label: "Editor", icon: Code },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

export default function SettingsPage() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const { setSettingsOpen } = useSettingsStore();

  useEffect(() => {
    let cancelled = false;

    void window.api.window.isFullScreen().then((fullScreen) => {
      if (!cancelled) {
        setIsFullScreen(fullScreen);
      }
    });

    const unsubscribe = window.api.window.onFullScreenChange((fullScreen) => {
      setIsFullScreen(fullScreen);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "var(--background)" }}
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between py-3 pr-4 flex-shrink-0"
        style={{
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingLeft: isFullScreen ? 12 : 88,
        }}
      >
        <h1 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Settings
        </h1>
        <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(false)}>
          <X size={14} />
        </Button>
      </div>

      {/* Body: sidebar nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Nav sidebar — not scrollable */}
        <nav
          className="flex-shrink-0 flex flex-col gap-0.5 py-3 overflow-hidden"
          style={{
            width: 180,
            paddingLeft: isFullScreen ? 12 : 16,
            paddingRight: 8,
            borderRight: "1px solid var(--border-faint)",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] text-left transition-colors duration-100"
                style={{
                  background: isActive ? "var(--surface-hover)" : "transparent",
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <Icon size={14} style={{ opacity: isActive ? 0.8 : 0.45, flexShrink: 0 }} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content panel — only this scrolls */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-xl mx-auto px-8 py-6">
            {activeSection === "general" && <GeneralSection />}
            {activeSection === "appearance" && <AppearanceSection />}
            {activeSection === "terminal" && <TerminalSection />}
            {activeSection === "editor" && <EditorSection />}
            {activeSection === "browser" && <BrowserSection />}
            {activeSection === "shortcuts" && <ShortcutSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function GeneralSection() {
  const { showShortcutHintsOnModifierPress, leaderTimeoutMs, updateSetting } = useSettingsStore();

  return (
    <section>
      <SectionTitle>General</SectionTitle>
      <SettingRow label="Shell command">
        <InstallCliButton />
      </SettingRow>
      <SettingRow label="Show shortcut hints on modifier press">
        <Toggle
          checked={showShortcutHintsOnModifierPress}
          onChange={(value) => updateSetting("showShortcutHintsOnModifierPress", value)}
        />
      </SettingRow>
      <SettingRow label="Leader timeout (ms)">
        <div className="flex flex-col items-end gap-1">
          <NumberInput
            value={leaderTimeoutMs}
            onChange={(value) => updateSetting("leaderTimeoutMs", value)}
            min={250}
            max={10000}
            step={250}
          />
          <span
            className="text-[11px] text-right max-w-[280px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            How long leader mode waits for a Devspace shortcut before restoring the pane.
          </span>
        </div>
      </SettingRow>
    </section>
  );
}

function AppearanceSection() {
  const { themeMode, fontSize, updateSetting } = useSettingsStore();

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
          onChange={(v) => updateSetting("themeMode", v as "system" | "dark" | "light")}
        />
      </SettingRow>
      <SettingRow label="Font size">
        <NumberInput
          value={fontSize}
          onChange={(v) => updateSetting("fontSize", v)}
          min={10}
          max={24}
        />
      </SettingRow>
    </section>
  );
}

function TerminalSection() {
  const { defaultShell, terminalScrollback, terminalCursorStyle, updateSetting } =
    useSettingsStore();

  return (
    <section>
      <SectionTitle>Terminal</SectionTitle>
      <SettingRow label="Default shell">
        <TextInput
          value={defaultShell}
          onChange={(v) => updateSetting("defaultShell", v)}
          placeholder="Auto-detect"
        />
      </SettingRow>
      <SettingRow label="Scrollback lines">
        <NumberInput
          value={terminalScrollback}
          onChange={(v) => updateSetting("terminalScrollback", v)}
          min={500}
          max={50000}
          step={500}
        />
      </SettingRow>
      <SettingRow label="Cursor style">
        <SegmentedControl
          options={[
            { label: "Block", value: "block" as const },
            { label: "Underline", value: "underline" as const },
            { label: "Bar", value: "bar" as const },
          ]}
          value={terminalCursorStyle}
          onChange={(v) => updateSetting("terminalCursorStyle", v as "block" | "underline" | "bar")}
        />
      </SettingRow>
    </section>
  );
}

function EditorSection() {
  const { vscodeCliPath, keepVscodeServerRunning, updateSetting } = useSettingsStore();
  const [editorCliStatus, setEditorCliStatus] = useState<EditorCliStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.api.editor.getCliStatus(vscodeCliPath).then((status) => {
      if (!cancelled) {
        setEditorCliStatus(status);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [vscodeCliPath]);

  return (
    <section>
      <SectionTitle>Editor</SectionTitle>
      <SettingRow label="Engine">
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          VS Code (code serve-web)
        </span>
      </SettingRow>
      <SettingRow label="VS Code CLI path or command">
        <div className="flex flex-col items-end gap-1">
          <TextInput
            value={vscodeCliPath}
            onChange={(v) => updateSetting("vscodeCliPath", v)}
            placeholder="Auto-detect"
            className="w-64"
          />
          <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Blank prefers the VS Code app bundle, then <code>code</code> in PATH.
          </span>
          <EditorCliStatusText status={editorCliStatus} />
        </div>
      </SettingRow>
      <SettingRow label="Keep editor server running after quit">
        <div className="flex flex-col items-end gap-1">
          <Toggle
            checked={keepVscodeServerRunning}
            onChange={(v) => updateSetting("keepVscodeServerRunning", v)}
          />
          <span
            className="text-[11px] text-right max-w-[280px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Keeps a local VS Code server in the background for faster reopen.
          </span>
        </div>
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

// ── Keyboard Shortcuts Section ────────────────────────────────────────────────

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

  const handleRecord = useCallback((action: ShortcutAction, shortcut: StoredShortcut) => {
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
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Keyboard Shortcuts</SectionTitle>
        {hasAnyOverrides && (
          <button
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors duration-100"
            style={{
              color: "var(--muted-foreground)",
              background: "var(--surface)",
            }}
            onClick={handleResetAll}
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Filter shortcuts..."
        className="w-full mb-4 px-3 py-1.5 text-[13px] rounded-md outline-none transition-colors duration-150"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-faint)",
          color: "var(--foreground)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent-border)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-muted)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border-faint)";
          e.currentTarget.style.boxShadow = "none";
        }}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {SHORTCUT_CATEGORIES.map((cat) => {
        const defs = getVisibleShortcutsForCategory(cat.id);
        const filteredDefs = filterLower
          ? defs.filter((d) => d.label.toLowerCase().includes(filterLower))
          : defs;

        if (filteredDefs.length === 0) return null;

        const numberedBase =
          cat.id === "workspaces" ? "select-workspace" : cat.id === "tabs" ? "select-tab" : null;

        return (
          <div key={cat.id} className="mb-5">
            <h3
              className="text-[11px] font-medium uppercase tracking-wide mb-2"
              style={{ color: "var(--foreground-faint)" }}
            >
              {cat.label}
            </h3>
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              {filteredDefs.map((def, i) => {
                const current = resolveShortcut(def.action, overridesMap);
                const conflict = findConflict(current, def.action, overridesMap);
                const conflictText = conflict ? `Conflicts with ${conflict.label}` : undefined;

                return (
                  <div
                    key={def.action}
                    className="flex items-center justify-between px-4 py-2"
                    style={{
                      borderBottom:
                        i < filteredDefs.length - 1 || numberedBase
                          ? "1px solid var(--border-faint)"
                          : undefined,
                    }}
                  >
                    <span className="text-[13px]" style={{ color: "var(--foreground-muted)" }}>
                      {def.label}
                    </span>
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
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[13px]" style={{ color: "var(--foreground-muted)" }}>
                      Select {cat.id === "workspaces" ? "Workspace" : "Tab"} 1...9
                    </span>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                      style={{
                        color: "var(--foreground)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {getNumberedGroupDisplayString(numberedBase, overridesMap)}
                    </span>
                  </div>
                )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function EditorCliStatusText({ status }: { status: EditorCliStatus | null }) {
  if (!status) {
    return null;
  }

  if (status.path !== null) {
    return (
      <span className="text-[11px] break-all" style={{ color: "var(--muted-foreground)" }}>
        Using {status.path} ({formatCliSource(status.source)})
      </span>
    );
  }

  if (status.reason === "configured-not-found") {
    return (
      <span className="text-[11px] break-all" style={{ color: "var(--destructive)" }}>
        Configured CLI not found: {status.attempted}
      </span>
    );
  }

  return (
    <span className="text-[11px]" style={{ color: "var(--destructive)" }}>
      VS Code CLI not found.
    </span>
  );
}

function formatCliSource(source: Extract<EditorCliStatus, { path: string }>["source"]) {
  switch (source) {
    case "configured-path":
      return "configured path";
    case "configured-command":
      return "configured command";
    case "bundle":
      return "VS Code app bundle";
    case "path":
      return "PATH";
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold mb-5" style={{ color: "var(--foreground)" }}>
      {children}
    </h2>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: "1px solid var(--border-faint)" }}
    >
      <span className="text-[13px]" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </span>
      {children}
    </div>
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
    <div
      className="flex gap-0.5 rounded-md p-0.5"
      style={{ background: "var(--surface)", border: "1px solid var(--border-faint)" }}
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1 text-xs rounded transition-colors duration-100"
          style={{
            background: value === opt.value ? "var(--card)" : "transparent",
            color: value === opt.value ? "var(--foreground)" : "var(--foreground-muted)",
            fontWeight: value === opt.value ? 500 : 400,
            boxShadow: value === opt.value ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = useCallback(() => {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed)) {
      setDraft(String(value));
      return;
    }

    const nextValue = Math.max(min ?? parsed, Math.min(max ?? parsed, parsed));
    setDraft(String(nextValue));
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }, [draft, max, min, onChange, value]);

  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commitValue();
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-20 h-7 px-2 text-xs rounded-md outline-none transition-colors duration-150"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-faint)",
        color: "var(--foreground)",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-muted)";
      }}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitValue = useCallback(() => {
    if (draft !== value) {
      onChange(draft);
    }
  }, [draft, onChange, value]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commitValue();
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      className={`${className ?? "w-40"} h-7 px-2 text-xs rounded-md outline-none transition-colors duration-150`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-faint)",
        color: "var(--foreground)",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-muted)";
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-colors duration-200"
      style={{
        background: checked ? "var(--accent)" : "var(--border)",
      }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

function InstallCliButton() {
  const [status, setStatus] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleInstall = async (): Promise<void> => {
    setStatus("installing");
    try {
      const result = await window.api.cli.install();
      if (result.ok) {
        setStatus("done");
      } else {
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
      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Installed at /usr/local/bin/devspace
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="text-xs" style={{ color: "var(--destructive)" }}>
        {errorMsg}
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleInstall} disabled={status === "installing"}>
      <Terminal size={12} />
      {status === "installing" ? "Installing..." : "Install 'devspace' command in PATH"}
    </Button>
  );
}

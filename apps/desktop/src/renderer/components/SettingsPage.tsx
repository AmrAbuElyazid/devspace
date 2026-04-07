import { useState, useEffect, useCallback } from "react";
import { X, Terminal, RotateCcw } from "lucide-react";
import { useSettingsStore } from "../store/settings-store";
import { Button } from "./ui/button";
import { ShortcutRecorder } from "./ui/shortcut-recorder";
import BrowserImportPanel from "./browser/BrowserImportPanel";
import {
  SHORTCUT_CATEGORIES,
  getVisibleShortcutsForCategory,
  getNumberedGroupDisplayString,
  resolveShortcut,
  findConflict,
  type ShortcutAction,
  type StoredShortcut,
} from "../../shared/shortcuts";

export default function SettingsPage() {
  const {
    showShortcutHintsOnModifierPress,
    fontSize,
    vscodeCliPath,
    defaultShell,
    terminalScrollback,
    terminalCursorStyle,
    keepVscodeServerRunning,
    updateSetting,
    setSettingsOpen,
  } = useSettingsStore();

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto" style={{ background: "var(--surface)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <h1 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
          Settings
        </h1>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(false)}>
          <X size={16} />
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-8">
        {/* General */}
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
        </section>

        {/* Appearance */}
        <section>
          <SectionTitle>Appearance</SectionTitle>
          <SettingRow label="Font size">
            <NumberInput
              value={fontSize}
              onChange={(v) => updateSetting("fontSize", v)}
              min={10}
              max={24}
            />
          </SettingRow>
        </section>

        {/* Terminal */}
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
              onChange={(v) =>
                updateSetting("terminalCursorStyle", v as "block" | "underline" | "bar")
              }
            />
          </SettingRow>
        </section>

        {/* Editor */}
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
                className="w-80 max-w-[32rem]"
              />
              <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                Blank prefers the VS Code app bundle, then <code>code</code> in PATH.
              </span>
            </div>
          </SettingRow>
          <SettingRow label="Keep editor server running after quit">
            <Toggle
              checked={keepVscodeServerRunning}
              onChange={(v) => updateSetting("keepVscodeServerRunning", v)}
            />
          </SettingRow>
        </section>

        {/* Keyboard Shortcuts */}
        <section>
          <SectionTitle>Browser</SectionTitle>
          <BrowserImportPanel />
        </section>

        {/* Keyboard Shortcuts */}
        <ShortcutSettingsSection />
      </div>
    </div>
  );
}

// --- Sub-components (small, tightly coupled to this page) ---

// ── Keyboard Shortcuts Section ───────────────────────────────────────────

function ShortcutSettingsSection() {
  const [overrides, setOverrides] = useState<Record<string, StoredShortcut>>({});
  const [filter, setFilter] = useState("");

  // Load overrides from main process on mount
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
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
            style={{
              color: "var(--muted-foreground)",
              background: "var(--surface-hover)",
            }}
            onClick={handleResetAll}
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        )}
      </div>

      {/* Search filter */}
      <input
        type="text"
        placeholder="Filter shortcuts..."
        className="w-full mb-4 px-3 py-1.5 text-sm rounded-md"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          outline: "none",
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

        // Check if this category has numbered shortcuts (show as summary row)
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
              style={{ border: "1px solid var(--border)" }}
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
                      background: "var(--background)",
                      borderBottom:
                        i < filteredDefs.length - 1 || numberedBase
                          ? "1px solid var(--border-faint)"
                          : undefined,
                    }}
                  >
                    <span className="text-sm" style={{ color: "var(--foreground-muted)" }}>
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

              {/* Numbered shortcut summary row (e.g. "Select Workspace 1...9 ⌘1...9") */}
              {numberedBase &&
                (!filterLower || `select ${cat.id.slice(0, -1)} 1-9`.includes(filterLower)) && (
                  <div
                    className="flex items-center justify-between px-4 py-2"
                    style={{ background: "var(--background)" }}
                  >
                    <span className="text-sm" style={{ color: "var(--foreground-muted)" }}>
                      Select {cat.id === "workspaces" ? "Workspace" : "Tab"} 1...9
                    </span>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded"
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-wide mb-4"
      style={{ color: "var(--foreground-faint)", letterSpacing: "0.5px" }}
    >
      {children}
    </h2>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: "1px solid var(--border-faint)" }}
    >
      <span className="text-sm" style={{ color: "var(--foreground)" }}>
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
    <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: "var(--background)" }}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1 text-xs rounded transition-colors"
          style={{
            background: value === opt.value ? "var(--surface-hover)" : "transparent",
            color: value === opt.value ? "var(--foreground)" : "var(--foreground-muted)",
            fontWeight: value === opt.value ? 500 : 400,
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
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v)) onChange(Math.max(min ?? v, Math.min(max ?? v, v)));
      }}
      min={min}
      max={max}
      step={step}
      className="w-20 h-7 px-2 text-xs rounded outline-none"
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
        fontFamily: "monospace",
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
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${className ?? "w-40"} h-7 px-2 text-xs rounded outline-none`}
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
        fontFamily: "monospace",
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-colors"
      style={{ background: checked ? "var(--accent)" : "var(--border)" }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
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

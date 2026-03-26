import { useState } from "react";
import { X, Terminal } from "lucide-react";
import { useSettingsStore } from "../store/settings-store";
import { Kbd } from "./ui/kbd";
import { Button } from "./ui/button";
import BrowserImportPanel from "./browser/BrowserImportPanel";

const shortcuts = [
  { keys: "⌘N", action: "New workspace" },
  { keys: "⌘T", action: "New tab" },
  { keys: "⌘W", action: "Close tab" },
  { keys: "⌘B", action: "Toggle sidebar" },
  { keys: "⌘,", action: "Settings" },
  { keys: "⌘D", action: "Split right" },
  { keys: "⌘⇧D", action: "Split down" },
  { keys: "⌘1-9", action: "Switch tab" },
  { keys: "⌃1-9", action: "Switch workspace" },

  { keys: "Esc", action: "Close settings" },
];

export default function SettingsPage() {
  const {
    fontSize,
    defaultShell,
    terminalScrollback,
    terminalCursorStyle,
    keepVscodeServerRunning,
    defaultPaneType,
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
          <SettingRow label="Default new tab">
            <SegmentedControl
              options={[
                { label: "Terminal", value: "terminal" as const },
                { label: "Browser", value: "browser" as const },
                { label: "Picker", value: "empty" as const },
              ]}
              value={defaultPaneType}
              onChange={(v) =>
                updateSetting("defaultPaneType", v as "empty" | "terminal" | "browser")
              }
            />
          </SettingRow>
          <SettingRow label="Shell command">
            <InstallCliButton />
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
        <section>
          <SectionTitle>Keyboard Shortcuts</SectionTitle>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {shortcuts.map((s, i) => (
              <div
                key={s.keys}
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                  background: "var(--background)",
                  borderBottom:
                    i < shortcuts.length - 1 ? "1px solid var(--border-faint)" : undefined,
                }}
              >
                <span className="text-sm" style={{ color: "var(--foreground-muted)" }}>
                  {s.action}
                </span>
                <Kbd>{s.keys}</Kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Sub-components (small, tightly coupled to this page) ---

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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-40 h-7 px-2 text-xs rounded outline-none"
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

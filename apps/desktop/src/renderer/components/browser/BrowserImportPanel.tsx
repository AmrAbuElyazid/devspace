import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";
import type {
  BrowserImportMode,
  BrowserImportResult,
  BrowserImportSource,
  BrowserProfileDescriptor,
  ClearBrowsingDataTarget,
} from "../../../shared/browser";
import { Button } from "../ui/button";

type ImportState =
  | { status: "idle" }
  | { status: "loading"; browser: BrowserImportSource; mode: BrowserImportMode }
  | { status: "success"; message: string }
  | { status: "error"; message: string; code?: string };

type ClearState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; target: ClearBrowsingDataTarget }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const SAFARI_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

const browserOptions: Array<{ label: string; value: BrowserImportSource }> = [
  { label: "Chrome", value: "chrome" },
  { label: "Arc", value: "arc" },
  { label: "Safari", value: "safari" },
  { label: "Zen", value: "zen" },
];

const importModeOptions: Array<{ label: string; value: BrowserImportMode }> = [
  { label: "Cookies + Session", value: "cookies" },
  { label: "History", value: "history" },
  { label: "Everything", value: "everything" },
];

const BROWSERS_WITH_PROFILES = new Set<BrowserImportSource>(["chrome", "arc", "zen"]);

export default function BrowserImportPanel() {
  const [browser, setBrowser] = useState<BrowserImportSource>("chrome");
  const [profiles, setProfiles] = useState<BrowserProfileDescriptor[]>([]);
  const [profilesStatus, setProfilesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [profilesMessage, setProfilesMessage] = useState<string | null>(null);
  const [selectedProfilePath, setSelectedProfilePath] = useState("");
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const [clearState, setClearState] = useState<ClearState>({ status: "idle" });

  const hasProfiles = BROWSERS_WITH_PROFILES.has(browser);

  useEffect(() => {
    let cancelled = false;

    if (!hasProfiles) {
      setProfiles([]);
      setSelectedProfilePath("");
      setProfilesStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    setProfilesStatus("loading");
    setProfilesMessage(null);

    void window.api.browser
      .listProfiles(browser)
      .then((result) => {
        if (cancelled) return;
        setProfiles(result);
        setSelectedProfilePath((current) => {
          if (current && result.some((profile) => profile.path === current)) {
            return current;
          }
          return result[0]?.path ?? "";
        });
        setProfilesStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setProfiles([]);
        setSelectedProfilePath("");
        setProfilesStatus("error");
        setProfilesMessage(
          error instanceof Error
            ? error.message
            : `Failed to load ${browserLabel(browser)} profiles.`,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [browser, hasProfiles]);

  const isImporting = importState.status === "loading";
  const hasProfile = selectedProfilePath.length > 0;
  const importDisabled = isImporting || (hasProfiles && !hasProfile);
  const selectedProfileName = useMemo(
    () => profiles.find((profile) => profile.path === selectedProfilePath)?.name,
    [profiles, selectedProfilePath],
  );

  async function handleImport(mode: BrowserImportMode): Promise<void> {
    if (importDisabled) {
      return;
    }

    setImportState({ status: "loading", browser, mode });

    try {
      const profilePath = hasProfiles ? selectedProfilePath : null;
      const result: BrowserImportResult = await window.api.browser.importBrowser(
        browser,
        profilePath,
        mode,
      );

      if (result.ok) {
        setImportState({
          status: "success",
          message: buildSuccessMessage(browser, mode, result, selectedProfileName),
        });
        return;
      }

      setImportState({
        status: "error",
        code: result.code,
        message: result.message ?? buildErrorMessage(browser, mode, result),
      });
    } catch (error) {
      setImportState({
        status: "error",
        message: error instanceof Error ? error.message : "Browser import failed.",
      });
    }
  }

  async function handleClearData(target: ClearBrowsingDataTarget): Promise<void> {
    setClearState({ status: "loading" });

    try {
      const result = await window.api.browser.clearBrowsingData(target);
      if (result.ok) {
        setClearState({
          status: "success",
          message:
            target === "everything"
              ? "All browsing data has been cleared."
              : `Cleared ${target} successfully.`,
        });
      } else {
        setClearState({
          status: "error",
          message: result.error ?? "Failed to clear browsing data.",
        });
      }
    } catch (error) {
      setClearState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to clear browsing data.",
      });
    }
  }

  return (
    <div
      className="browser-import-panel"
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      {/* ── Import Browsing Data ────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--card)",
          padding: 16,
        }}
      >
        <h3 className="text-[13px] font-medium mb-0.5" style={{ color: "var(--foreground)" }}>
          Import Browsing Data
        </h3>
        <p className="text-[11px] mb-3" style={{ color: "var(--muted-foreground)" }}>
          Import cookies, history, or both from another browser.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Source + Profile row */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--foreground-faint)" }}
              >
                Source
              </span>
              <select
                className="browser-import-select"
                style={{ width: 140 }}
                value={browser}
                onChange={(event) => setBrowser(event.target.value as BrowserImportSource)}
                disabled={isImporting}
              >
                {browserOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {hasProfiles && profiles.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: "var(--foreground-faint)" }}
                >
                  Profile
                </span>
                <select
                  className="browser-import-select"
                  style={{ width: 180 }}
                  value={selectedProfilePath}
                  onChange={(event) => setSelectedProfilePath(event.target.value)}
                  disabled={profilesStatus === "loading" || isImporting}
                >
                  {profiles.map((profile) => (
                    <option key={profile.path} value={profile.path}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {/* Profile status messages */}
          {hasProfiles && profiles.length === 0 ? (
            <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              {profilesStatus === "loading"
                ? `Looking for ${browserLabel(browser)} profiles...`
                : profilesStatus === "error"
                  ? (profilesMessage ?? `Failed to load ${browserLabel(browser)} profiles.`)
                  : `No importable ${browserLabel(browser)} profiles were found.`}
            </div>
          ) : null}

          {/* Safari FDA warning */}
          {browser === "safari" ? (
            <div
              className="flex items-center justify-between gap-3 text-[11px] px-3 py-2 rounded-md"
              style={{
                color: "var(--foreground-muted)",
                background:
                  importState.status === "error" &&
                  importState.code === "SAFARI_FULL_DISK_ACCESS_REQUIRED"
                    ? "color-mix(in srgb, var(--warning) 8%, var(--surface))"
                    : "var(--surface)",
                border: "1px solid var(--border-faint)",
              }}
            >
              <span>Safari may require Full Disk Access.</span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => window.api.shell.openExternal(SAFARI_SETTINGS_URL)}
              >
                <ExternalLink size={11} />
                Privacy Settings
              </Button>
            </div>
          ) : null}

          {/* Import actions */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {importModeOptions.map((option) => {
              const isCurrentAction =
                importState.status === "loading" &&
                importState.browser === browser &&
                importState.mode === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={option.value === "everything" ? "default" : "secondary"}
                  onClick={() => void handleImport(option.value)}
                  disabled={importDisabled}
                >
                  {isCurrentAction ? <LoaderCircle size={12} className="animate-spin" /> : null}
                  {option.label}
                </Button>
              );
            })}
          </div>

          {/* Import status */}
          <StatusMessage state={importState} />
        </div>
      </div>

      {/* ── Clear Browsing Data ─────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--card)",
          padding: 16,
        }}
      >
        <h3 className="text-[13px] font-medium mb-0.5" style={{ color: "var(--foreground)" }}>
          Clear Browsing Data
        </h3>
        <p className="text-[11px] mb-3" style={{ color: "var(--muted-foreground)" }}>
          Remove stored data from the in-app browser session.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Confirm banner */}
          {clearState.status === "confirm" ? (
            <div
              className="flex items-center justify-between gap-3 text-[12px] px-3 py-2.5 rounded-md"
              style={{
                color: "var(--foreground)",
                background: "color-mix(in srgb, var(--warning) 8%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--warning) 20%, var(--border))",
              }}
            >
              <span>
                Delete{" "}
                {clearState.target === "everything" ? "all browsing data" : clearState.target}? This
                cannot be undone.
              </span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setClearState({ status: "idle" })}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => void handleClearData(clearState.target)}
                >
                  <Trash2 size={11} />
                  Delete
                </Button>
              </div>
            </div>
          ) : null}

          {/* Clear actions */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "cookies" })}
            >
              Clear Cookies
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "history" })}
            >
              Clear History
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "cache" })}
            >
              Clear Cache
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "everything" })}
            >
              {clearState.status === "loading" ? (
                <LoaderCircle size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Clear Everything
            </Button>
          </div>

          {/* Clear status */}
          {clearState.status === "success" || clearState.status === "error" ? (
            <StatusInline status={clearState.status} message={clearState.message} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusMessage({ state }: { state: ImportState }) {
  if (state.status === "idle") return null;

  const statusType = state.status === "loading" ? "loading" : state.status;
  const message =
    state.status === "loading"
      ? `Importing ${labelForMode(state.mode).toLowerCase()} from ${browserLabel(state.browser)}...`
      : state.message;

  return <StatusInline status={statusType} message={message} />;
}

function StatusInline({ status, message }: { status: string; message: string }) {
  return (
    <div
      className="flex items-center gap-2 text-[12px] py-1"
      style={{ color: status === "error" ? "var(--destructive)" : "var(--foreground-muted)" }}
    >
      {status === "loading" ? (
        <LoaderCircle size={13} className="animate-spin flex-shrink-0" />
      ) : null}
      {status === "success" ? <CheckCircle2 size={13} className="flex-shrink-0" /> : null}
      {status === "error" ? <AlertCircle size={13} className="flex-shrink-0" /> : null}
      <span>{message}</span>
    </div>
  );
}

function browserLabel(browser: BrowserImportSource): string {
  const labels: Record<BrowserImportSource, string> = {
    chrome: "Chrome",
    arc: "Arc",
    safari: "Safari",
    zen: "Zen",
  };
  return labels[browser];
}

function labelForMode(mode: BrowserImportMode): string {
  return importModeOptions.find((option) => option.value === mode)?.label ?? "Everything";
}

function buildSuccessMessage(
  browser: BrowserImportSource,
  mode: BrowserImportMode,
  result: Extract<BrowserImportResult, { ok: true }>,
  selectedProfileName?: string,
): string {
  const source = selectedProfileName
    ? `${browserLabel(browser)} (${selectedProfileName})`
    : browserLabel(browser);
  const details: string[] = [];

  if (mode !== "history") {
    details.push(`${result.importedCookies} cookies`);
  }
  if (mode !== "cookies") {
    details.push(`${result.importedHistory} history entries`);
  }

  return `Imported ${details.join(" and ")} from ${source}.`;
}

function buildErrorMessage(
  browser: BrowserImportSource,
  mode: BrowserImportMode,
  result: Extract<BrowserImportResult, { ok: false }>,
): string {
  return `Failed to import ${labelForMode(mode).toLowerCase()} from ${browserLabel(browser)} (${result.code}).`;
}

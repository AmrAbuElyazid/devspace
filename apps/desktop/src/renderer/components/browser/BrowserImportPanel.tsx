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
    <div className="browser-import-panel">
      {/* Import card */}
      <div className="browser-import-card">
        <div className="browser-import-card-header">
          <div>
            <h3 className="browser-import-card-title">Import Browsing Data</h3>
            <p className="browser-import-card-copy">
              Import cookies, history, or both from another browser into the in-app browser session.
            </p>
          </div>
        </div>

        <div className="browser-import-stack">
          <div className="browser-import-field">
            <span className="browser-import-label">Source browser</span>
            <select
              className="browser-import-select"
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

          {hasProfiles ? (
            <div className="browser-import-field">
              <span className="browser-import-label">{browserLabel(browser)} profile</span>
              {profiles.length > 0 ? (
                <select
                  className="browser-import-select"
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
              ) : (
                <div className="browser-import-note">
                  {profilesStatus === "loading"
                    ? `Looking for ${browserLabel(browser)} profiles...`
                    : profilesStatus === "error"
                      ? (profilesMessage ?? `Failed to load ${browserLabel(browser)} profiles.`)
                      : `No importable ${browserLabel(browser)} profiles were found on this machine.`}
                </div>
              )}
            </div>
          ) : null}

          {browser === "safari" ? (
            <div
              className="browser-import-note"
              data-variant={
                importState.status === "error" &&
                importState.code === "SAFARI_FULL_DISK_ACCESS_REQUIRED"
                  ? "warning"
                  : "default"
              }
            >
              <div>
                Safari imports may require Full Disk Access before DevSpace can read Safari cookies
                or history.
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.api.shell.openExternal(SAFARI_SETTINGS_URL)}
              >
                <ExternalLink size={13} />
                Open Privacy Settings
              </Button>
            </div>
          ) : null}

          <div className="browser-import-field">
            <span className="browser-import-label">Import</span>
            <div className="browser-import-actions">
              {importModeOptions.map((option) => {
                const isCurrentAction =
                  importState.status === "loading" &&
                  importState.browser === browser &&
                  importState.mode === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={option.value === "everything" ? "default" : "secondary"}
                    onClick={() => void handleImport(option.value)}
                    disabled={importDisabled}
                  >
                    {isCurrentAction ? <LoaderCircle size={14} className="animate-spin" /> : null}
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {importState.status !== "idle" ? (
            <div className="browser-import-status" data-status={importState.status}>
              <span className="browser-import-status-icon">
                {importState.status === "loading" ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : null}
                {importState.status === "success" ? <CheckCircle2 size={15} /> : null}
                {importState.status === "error" ? <AlertCircle size={15} /> : null}
              </span>
              <span>
                {importState.status === "loading"
                  ? `Importing ${labelForMode(importState.mode).toLowerCase()} from ${browserLabel(importState.browser)}...`
                  : importState.message}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Clear data card */}
      <div className="browser-import-card">
        <div className="browser-import-card-header">
          <div>
            <h3 className="browser-import-card-title">Clear Browsing Data</h3>
            <p className="browser-import-card-copy">
              Remove stored data from the in-app browser session to start fresh.
            </p>
          </div>
        </div>

        <div className="browser-import-stack">
          {clearState.status === "confirm" ? (
            <div className="browser-import-note" data-variant="warning">
              <div>
                This will permanently delete{" "}
                {clearState.target === "everything"
                  ? "all browsing data (cookies, history, cache, and local storage)"
                  : clearState.target}{" "}
                from the in-app browser. This cannot be undone.
              </div>
              <div className="browser-import-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setClearState({ status: "idle" })}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleClearData(clearState.target)}
                >
                  <Trash2 size={13} />
                  Confirm
                </Button>
              </div>
            </div>
          ) : null}

          <div className="browser-import-field">
            <div className="browser-import-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={clearState.status === "loading"}
                onClick={() => setClearState({ status: "confirm", target: "cookies" })}
              >
                Clear Cookies
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={clearState.status === "loading"}
                onClick={() => setClearState({ status: "confirm", target: "history" })}
              >
                Clear History
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={clearState.status === "loading"}
                onClick={() => setClearState({ status: "confirm", target: "cache" })}
              >
                Clear Cache
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={clearState.status === "loading"}
                onClick={() => setClearState({ status: "confirm", target: "everything" })}
              >
                {clearState.status === "loading" ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Clear Everything
              </Button>
            </div>
          </div>

          {clearState.status === "success" || clearState.status === "error" ? (
            <div className="browser-import-status" data-status={clearState.status}>
              <span className="browser-import-status-icon">
                {clearState.status === "success" ? <CheckCircle2 size={15} /> : null}
                {clearState.status === "error" ? <AlertCircle size={15} /> : null}
              </span>
              <span>{clearState.message}</span>
            </div>
          ) : null}
        </div>
      </div>
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

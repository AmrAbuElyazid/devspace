import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";

import type {
  BrowserImportMode,
  BrowserImportResult,
  BrowserImportSource,
  BrowserProfileDescriptor,
  ClearBrowsingDataTarget,
} from "../../../shared/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
          if (current && result.some((p) => p.path === current)) return current;
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
    () => profiles.find((p) => p.path === selectedProfilePath)?.name,
    [profiles, selectedProfilePath],
  );

  async function handleImport(mode: BrowserImportMode) {
    if (importDisabled) return;
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

  async function handleClearData(target: ClearBrowsingDataTarget) {
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
    <div className="flex flex-col gap-4">
      {/* Import Browsing Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[13px]">Import browsing data</CardTitle>
          <CardDescription className="text-[11.5px]">
            Import cookies, history, or both from another browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Source
              </Label>
              <Select
                value={browser}
                onValueChange={(v) => setBrowser(v as BrowserImportSource)}
                disabled={isImporting}
              >
                <SelectTrigger className="h-7 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {browserOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasProfiles && profiles.length > 0 ? (
              <div className="flex flex-col gap-1.5 min-w-[180px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Profile
                </Label>
                <Select
                  value={selectedProfilePath}
                  onValueChange={(v) => setSelectedProfilePath(v ?? "")}
                  disabled={profilesStatus === "loading" || isImporting}
                >
                  <SelectTrigger className="h-7 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.path} value={profile.path}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {hasProfiles && profiles.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {profilesStatus === "loading"
                ? `Looking for ${browserLabel(browser)} profiles…`
                : profilesStatus === "error"
                  ? (profilesMessage ?? `Failed to load ${browserLabel(browser)} profiles.`)
                  : `No importable ${browserLabel(browser)} profiles were found.`}
            </p>
          ) : null}

          {browser === "safari" ? (
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2 rounded-md border text-[11.5px]",
                importState.status === "error" &&
                  importState.code === "SAFARI_FULL_DISK_ACCESS_REQUIRED"
                  ? "bg-status-warning/10 border-status-warning/30 text-foreground"
                  : "bg-surface border-hairline text-muted-foreground",
              )}
            >
              <span>Safari may require Full Disk Access.</span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => window.api.shell.openExternal(SAFARI_SETTINGS_URL)}
              >
                <ExternalLink size={11} data-icon="inline-start" />
                Privacy Settings
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {importModeOptions.map((option) => {
              const isCurrent =
                importState.status === "loading" &&
                importState.browser === browser &&
                importState.mode === option.value;
              return (
                <Button
                  key={option.value}
                  size="sm"
                  variant={option.value === "everything" ? "default" : "secondary"}
                  onClick={() => void handleImport(option.value)}
                  disabled={importDisabled}
                >
                  {isCurrent ? (
                    <LoaderCircle size={12} className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  {option.label}
                </Button>
              );
            })}
          </div>

          <StatusMessage state={importState} />
        </CardContent>
      </Card>

      {/* Clear Browsing Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[13px]">Clear browsing data</CardTitle>
          <CardDescription className="text-[11.5px]">
            Remove stored data from the in-app browser session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {clearState.status === "confirm" ? (
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border",
                "bg-status-warning/10 border-status-warning/30 text-[12px] text-foreground",
              )}
            >
              <span>
                Delete{" "}
                {clearState.target === "everything" ? "all browsing data" : clearState.target}? This
                cannot be undone.
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setClearState({ status: "idle" })}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => void handleClearData(clearState.target)}
                >
                  <Trash2 size={11} data-icon="inline-start" />
                  Delete
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "cookies" })}
            >
              Clear cookies
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "history" })}
            >
              Clear history
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "cache" })}
            >
              Clear cache
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={clearState.status === "loading"}
              onClick={() => setClearState({ status: "confirm", target: "everything" })}
            >
              {clearState.status === "loading" ? (
                <LoaderCircle size={12} className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 size={12} data-icon="inline-start" />
              )}
              Clear everything
            </Button>
          </div>

          {clearState.status === "success" || clearState.status === "error" ? (
            <StatusInline status={clearState.status} message={clearState.message} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusMessage({ state }: { state: ImportState }) {
  if (state.status === "idle") return null;
  const statusType = state.status === "loading" ? "loading" : state.status;
  const message =
    state.status === "loading"
      ? `Importing ${labelForMode(state.mode).toLowerCase()} from ${browserLabel(state.browser)}…`
      : state.message;
  return <StatusInline status={statusType} message={message} />;
}

function StatusInline({ status, message }: { status: string; message: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[11.5px] py-0.5",
        status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "loading" ? (
        <LoaderCircle size={12} className="animate-spin flex-shrink-0" />
      ) : null}
      {status === "success" ? (
        <CheckCircle2 size={12} className="flex-shrink-0 text-status-success" />
      ) : null}
      {status === "error" ? <AlertCircle size={12} className="flex-shrink-0" /> : null}
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
  return importModeOptions.find((o) => o.value === mode)?.label ?? "Everything";
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
  if (mode !== "history") details.push(`${result.importedCookies} cookies`);
  if (mode !== "cookies") details.push(`${result.importedHistory} history entries`);
  return `Imported ${details.join(" and ")} from ${source}.`;
}

function buildErrorMessage(
  browser: BrowserImportSource,
  mode: BrowserImportMode,
  result: Extract<BrowserImportResult, { ok: false }>,
): string {
  return `Failed to import ${labelForMode(mode).toLowerCase()} from ${browserLabel(browser)} (${result.code}).`;
}

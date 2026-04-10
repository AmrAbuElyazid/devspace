import type { Cookie as SweetCookie } from "@steipete/sweet-cookie";
import type { BrowserImportMode, BrowserImportResult } from "../../shared/browser";
import type { BrowserHistoryRecorder } from "./browser-history-service";
import { BrowserImportServiceError } from "./browser-import-errors";
import { dedupeHistoryEntries, type ImportedHistoryEntry } from "./browser-import-history";
import { importCookiesToSession, type BrowserCookieSession } from "./browser-import-session";

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export async function runBrowserImportMode(
  mode: BrowserImportMode,
  loaders: {
    loadHistory: () => Promise<ImportedHistoryEntry[]>;
    loadCookies: () => Promise<ImportedBrowserCookie[]>;
    onHistoryImported?: (count: number) => void;
  },
  deps: {
    historyService: Pick<BrowserHistoryRecorder, "importEntries">;
    getSession: () => BrowserCookieSession;
  },
): Promise<{ importedCookies: number; importedHistory: number }> {
  let importedHistory = 0;

  if (mode !== "cookies") {
    const historyEntries = dedupeHistoryEntries(await loaders.loadHistory());
    importedHistory = importHistoryEntries(historyEntries, deps.historyService);
    loaders.onHistoryImported?.(importedHistory);
  }

  let importedCookies = 0;
  if (mode !== "history") {
    const cookies = await loaders.loadCookies();
    importedCookies = await importCookiesToSession(deps.getSession(), cookies);
  }

  return { importedCookies, importedHistory };
}

export function toImportFailureResult(
  error: unknown,
  fallbackCode: string,
  options: {
    cookieWriteCode: string;
    importedHistory?: number;
  },
): BrowserImportResult {
  const importedHistory = options.importedHistory ?? 0;

  if (error instanceof BrowserImportServiceError) {
    const code = error.code === "COOKIE_WRITE_FAILED" ? options.cookieWriteCode : error.code;
    return {
      ok: false,
      code,
      importedCookies: 0,
      importedHistory,
      ...(error.retryable ? { retryable: true } : {}),
      message: error.message,
    };
  }

  return {
    ok: false,
    code: fallbackCode,
    importedCookies: 0,
    importedHistory,
    message: error instanceof Error ? error.message : String(error),
  };
}

function importHistoryEntries(
  entries: ImportedHistoryEntry[],
  historyService: Pick<BrowserHistoryRecorder, "importEntries">,
): number {
  if (entries.length === 0) {
    return 0;
  }

  historyService.importEntries(entries);
  return entries.length;
}

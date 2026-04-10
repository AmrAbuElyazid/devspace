import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Cookie as SweetCookie, GetCookiesOptions } from "@steipete/sweet-cookie";
import type { BrowserAccessResult, BrowserImportMode } from "../../shared/browser";
import {
  BrowserImportServiceError,
  throwCookieImportError,
  throwProviderWarning,
} from "./browser-import-errors";
import {
  mapHistoryRows,
  safariTimeToUnixMs,
  type ImportedHistoryEntry,
} from "./browser-import-history";
import { decodeSafariBinaryCookies } from "./browser-import-safari-cookies";
import { copyFileToTemp, queryDatabaseRows } from "./browser-import-storage";

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

type SafariGetCookiesImpl = (options: GetCookiesOptions) => Promise<{
  cookies: ImportedBrowserCookie[];
  warnings: string[];
}>;

const SAFARI_COOKIE_CANDIDATES = [
  join(homedir(), "Library", "Cookies", "Cookies.binarycookies"),
  join(
    homedir(),
    "Library",
    "Containers",
    "com.apple.Safari",
    "Data",
    "Library",
    "Cookies",
    "Cookies.binarycookies",
  ),
];

const SAFARI_HISTORY_DB = join(homedir(), "Library", "Safari", "History.db");

export function resolveSafariPaths(overrides?: { cookiesFile?: string; historyDb?: string }): {
  cookiesFile?: string;
  historyDb?: string;
} {
  const cookiesFile =
    overrides?.cookiesFile ?? SAFARI_COOKIE_CANDIDATES.find((candidate) => existsSync(candidate));

  return {
    ...(cookiesFile ? { cookiesFile } : {}),
    historyDb: overrides?.historyDb ?? SAFARI_HISTORY_DB,
  };
}

export async function loadSafariCookies(
  cookiesFile: string | undefined,
  getCookiesImpl: SafariGetCookiesImpl | null,
): Promise<ImportedBrowserCookie[]> {
  if (!getCookiesImpl) {
    return loadSafariCookiesFromSnapshot(cookiesFile);
  }

  if (!cookiesFile || !existsSync(cookiesFile)) {
    return [];
  }

  const snapshot = copyFileToTemp(cookiesFile);

  try {
    const result = await getCookiesImpl({
      browsers: ["safari"],
      safariCookiesFile: snapshot.filePath,
      includeExpired: false,
    } as GetCookiesOptions);

    throwProviderWarning("SAFARI_COOKIE_IMPORT_FAILED", result.warnings);

    return result.cookies;
  } catch (error) {
    if (error instanceof BrowserImportServiceError) {
      throw error;
    }

    throwCookieImportError("SAFARI_COOKIE_IMPORT_FAILED", error);
  } finally {
    snapshot.cleanup();
  }
}

export async function loadSafariHistory(
  historyDbPath: string | undefined,
): Promise<ImportedHistoryEntry[]> {
  if (!historyDbPath || !existsSync(historyDbPath)) {
    return [];
  }

  const rows = await queryDatabaseRows(
    historyDbPath,
    `
      SELECT history_items.url AS url, history_visits.title AS title, CAST(history_visits.visit_time AS TEXT) AS visited_at
      FROM history_visits
      INNER JOIN history_items ON history_items.id = history_visits.history_item
      ORDER BY history_visits.visit_time DESC
    `,
  );

  return mapHistoryRows(rows, {
    source: "safari-import",
    toVisitedAt: safariTimeToUnixMs,
  });
}

export async function detectSafariAccessFromFs(
  mode: BrowserImportMode,
  safariPaths: { cookiesFile?: string; historyDb?: string },
  statPath: (path: string) => unknown,
): Promise<BrowserAccessResult> {
  const protectedPaths = [
    ...(mode !== "history" ? [safariPaths.cookiesFile] : []),
    ...(mode !== "cookies" ? [safariPaths.historyDb] : []),
  ].filter((value): value is string => Boolean(value));

  for (const path of protectedPaths) {
    try {
      statPath(path);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === "EPERM" || code === "EACCES") {
        return {
          ok: false,
          code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
          message: "Grant Full Disk Access to DevSpace to import Safari data.",
        };
      }
    }
  }

  return { ok: true };
}

async function loadSafariCookiesFromSnapshot(
  cookiesFile: string | undefined,
): Promise<ImportedBrowserCookie[]> {
  if (!cookiesFile || !existsSync(cookiesFile)) {
    return [];
  }

  const snapshot = copyFileToTemp(cookiesFile);

  try {
    const parsed = decodeSafariBinaryCookies(readFileSync(snapshot.filePath));
    return parsed.filter(
      (cookie) => !cookie.expires || cookie.expires >= Math.floor(Date.now() / 1000),
    );
  } catch (error) {
    throwCookieImportError("SAFARI_COOKIE_IMPORT_FAILED", error);
  } finally {
    snapshot.cleanup();
  }
}

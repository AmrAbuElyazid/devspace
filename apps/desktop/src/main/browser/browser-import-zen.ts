import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Cookie as SweetCookie } from "@steipete/sweet-cookie";
import type { BrowserProfileDescriptor } from "../../shared/browser";
import { collectFirefoxCookies } from "./browser-import-firefox-cookies";
import { BrowserImportServiceError } from "./browser-import-errors";
import {
  firefoxTimeToUnixMs,
  mapHistoryRows,
  type ImportedHistoryEntry,
} from "./browser-import-history";
import { hasZenImportableData, parseProfilesIni } from "./browser-import-profiles";
import { queryDatabaseRows } from "./browser-import-storage";

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export const ZEN_ROOT = join(homedir(), "Library", "Application Support", "zen");

export async function listZenProfiles(zenRoot: string): Promise<BrowserProfileDescriptor[]> {
  const profilesIniPath = join(zenRoot, "profiles.ini");
  if (!existsSync(profilesIniPath)) {
    return [];
  }

  try {
    const iniContent = readFileSync(profilesIniPath, "utf8");
    const parsed = parseProfilesIni(iniContent);

    return parsed
      .map((profile) => ({
        name: profile.name,
        path: profile.isRelative ? join(zenRoot, profile.path) : profile.path,
        browser: "zen" as const,
      }))
      .filter((profile) => hasZenImportableData(profile.path))
      .toSorted((left, right) => left.name.localeCompare(right.name));
  } catch (err) {
    console.warn("[browser-import] Zen profile discovery failed:", err);
    return [];
  }
}

export async function loadZenCookies(profilePath: string): Promise<ImportedBrowserCookie[]> {
  const dbPath = join(profilePath, "cookies.sqlite");
  if (!existsSync(dbPath)) {
    return [];
  }

  try {
    const rows = await queryDatabaseRows(
      dbPath,
      "SELECT name, value, host, path, CAST(expiry AS TEXT) AS expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies",
    );
    return collectFirefoxCookies(rows, basename(profilePath));
  } catch (error) {
    throw new BrowserImportServiceError(
      "ZEN_COOKIE_IMPORT_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function loadZenHistory(profilePath: string): Promise<ImportedHistoryEntry[]> {
  const dbPath = join(profilePath, "places.sqlite");
  if (!existsSync(dbPath)) {
    return [];
  }

  const rows = await queryDatabaseRows(
    dbPath,
    `
      SELECT moz_places.url AS url, moz_places.title AS title, CAST(moz_historyvisits.visit_date AS TEXT) AS visited_at
      FROM moz_historyvisits
      INNER JOIN moz_places ON moz_places.id = moz_historyvisits.place_id
      ORDER BY moz_historyvisits.visit_date DESC
    `,
  );

  return mapHistoryRows(rows, {
    source: "zen-import",
    browserProfile: basename(profilePath),
    toVisitedAt: firefoxTimeToUnixMs,
  });
}

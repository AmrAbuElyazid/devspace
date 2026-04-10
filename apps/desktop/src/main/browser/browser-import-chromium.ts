import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { Cookie as SweetCookie } from "@steipete/sweet-cookie";
import type { BrowserImportSource, BrowserProfileDescriptor } from "../../shared/browser";
import {
  readChromeSafeStorageKey,
  type ChromiumBrowserTarget,
} from "./browser-import-chromium-keychain";
import {
  collectChromiumCookies,
  decryptChromiumCookieValue,
} from "./browser-import-chromium-cookies";
import { throwChromiumCookieImportError } from "./browser-import-errors";
import {
  chromeTimeToUnixMs,
  mapHistoryRows,
  type ImportedHistoryEntry,
} from "./browser-import-history";
import {
  hasChromiumImportableData,
  readChromiumProfileMetadata,
  resolveChromeCookiesDbPath,
} from "./browser-import-profiles";
import {
  copyDatabaseToTemp,
  queryCookieDb,
  queryDatabaseRows,
  readChromiumMetaVersion,
} from "./browser-import-storage";

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export async function listChromiumProfiles(
  root: string,
  source: BrowserImportSource,
): Promise<BrowserProfileDescriptor[]> {
  if (!existsSync(root)) {
    return [];
  }

  const metadata = readChromiumProfileMetadata(root);
  const entries = readdirSync(root, { withFileTypes: true });
  const profiles = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name === "Default" || /^Profile \d+$/.test(entry.name))
    .map((entry) => ({
      key: entry.name,
      path: join(root, entry.name),
    }))
    .filter((entry) => hasChromiumImportableData(entry.path))
    .map((entry) => ({
      name: metadata[entry.key] ?? entry.key,
      path: entry.path,
      browser: source,
    }));

  return profiles.toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function loadChromiumHistory(
  profilePath: string,
  target: ChromiumBrowserTarget,
): Promise<ImportedHistoryEntry[]> {
  const historyDbPath = join(profilePath, "History");
  if (!existsSync(historyDbPath)) {
    return [];
  }

  const rows = await queryDatabaseRows(
    historyDbPath,
    `
      SELECT urls.url AS url, urls.title AS title, CAST(visits.visit_time AS TEXT) AS visited_at
      FROM visits
      INNER JOIN urls ON urls.id = visits.url
      ORDER BY visits.visit_time DESC
    `,
  );

  return mapHistoryRows(rows, {
    source: toChromiumHistorySource(target),
    browserProfile: basename(profilePath),
    toVisitedAt: chromeTimeToUnixMs,
  });
}

export async function loadChromiumCookies(
  profilePath: string,
  target: ChromiumBrowserTarget,
): Promise<ImportedBrowserCookie[]> {
  const dbPath = resolveChromeCookiesDbPath(profilePath);
  if (!dbPath) {
    return [];
  }

  const snapshot = copyDatabaseToTemp(dbPath);

  try {
    const key = readChromeSafeStorageKey(target);
    const metaVersion = await readChromiumMetaVersion(snapshot.dbPath);
    const rows = await queryCookieDb(snapshot.dbPath);
    return collectChromiumCookies(rows, {
      browser: target,
      profile: basename(profilePath),
      includeExpired: false,
      decrypt: (encryptedValue) =>
        decryptChromiumCookieValue(encryptedValue, key, metaVersion >= 24),
    });
  } catch (error) {
    throwChromiumCookieImportError(target.toUpperCase(), error);
  } finally {
    snapshot.cleanup();
  }
}

function toChromiumHistorySource(target: ChromiumBrowserTarget): string {
  if (target === "chrome") {
    return "chrome-import";
  }

  if (target === "arc") {
    return "arc-import";
  }

  return `${target}-import`;
}

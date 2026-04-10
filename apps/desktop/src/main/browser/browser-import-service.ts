import { execFileSync } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { BrowserName, Cookie as SweetCookie, GetCookiesOptions } from "@steipete/sweet-cookie";
import type {
  BrowserAccessResult,
  BrowserImportMode,
  BrowserImportResult,
  BrowserImportSource,
  BrowserProfileDescriptor,
} from "../../shared/browser";
import type { BrowserHistoryEntryInput, BrowserHistoryRecorder } from "./browser-history-service";
import type { BrowserSessionManager } from "./browser-session-manager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_SOURCES: Record<BrowserImportSource, string> = {
  chrome: "chrome-import",
  arc: "arc-import",
  safari: "safari-import",
  zen: "zen-import",
};

export const CHROME_SAFE_STORAGE_TIMEOUT_MS = 15_000;

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

// ---------------------------------------------------------------------------
// Chromium browser registry (Chrome, Arc, Brave, Chromium)
// ---------------------------------------------------------------------------

type ChromiumBrowserTarget = keyof typeof CHROMIUM_KEYCHAINS;

const CHROMIUM_KEYCHAINS = {
  chrome: {
    root: join(homedir(), "Library", "Application Support", "Google", "Chrome"),
    account: "Chrome",
    service: "Chrome Safe Storage",
    label: "Chrome Safe Storage",
  },
  brave: {
    root: join(homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
    account: "Brave",
    service: "Brave Safe Storage",
    label: "Brave Safe Storage",
  },
  arc: {
    root: join(homedir(), "Library", "Application Support", "Arc", "User Data"),
    account: "Arc",
    service: "Arc Safe Storage",
    label: "Arc Safe Storage",
  },
  chromium: {
    root: join(homedir(), "Library", "Application Support", "Chromium"),
    account: "Chromium",
    service: "Chromium Safe Storage",
    label: "Chromium Safe Storage",
  },
} as const;

const IMPORT_SOURCE_TO_CHROMIUM: Partial<Record<BrowserImportSource, ChromiumBrowserTarget>> = {
  chrome: "chrome",
  arc: "arc",
};

// ---------------------------------------------------------------------------
// Zen / Firefox paths
// ---------------------------------------------------------------------------

const ZEN_ROOT = join(homedir(), "Library", "Application Support", "zen");

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ImportedHistoryEntry = Omit<BrowserHistoryEntryInput, "id">;

type CookieWriter = {
  cookies: {
    get?: (filter: Electron.CookiesGetFilter) => Promise<Electron.Cookie[]>;
    set: (details: Electron.CookiesSetDetails) => Promise<void>;
    remove?: (url: string, name: string) => Promise<void>;
    flushStore: () => Promise<void>;
  };
};

type ElectronCookieSameSite = Electron.CookiesSetDetails["sameSite"];
type GetCookiesResult = {
  cookies: SweetCookie[];
  warnings: string[];
};
type GetCookiesImpl = (options: GetCookiesOptions) => Promise<GetCookiesResult>;

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};
type ImportedCookieSnapshot = Electron.CookiesSetDetails & {
  hostOnly?: boolean;
};

type ImportedCookieInput = Electron.CookiesSetDetails & {
  hostOnly?: boolean;
};

type BrowserImportServiceDeps = {
  sessionManager: Pick<BrowserSessionManager, "getSession">;
  historyService: Pick<BrowserHistoryRecorder, "importEntries" | "clearAll">;
  chromiumRoots?: Partial<Record<ChromiumBrowserTarget, string>>;
  zenRoot?: string;
  safariPaths?: {
    cookiesFile?: string;
    historyDb?: string;
  };
  getCookiesImpl?: GetCookiesImpl;
  // Chromium overrides
  loadChromiumHistoryImpl?: (
    profilePath: string,
    browser: ChromiumBrowserTarget,
  ) => Promise<ImportedHistoryEntry[]>;
  loadChromiumCookiesImpl?: (
    profilePath: string,
    browser: ChromiumBrowserTarget,
  ) => Promise<ImportedBrowserCookie[]>;
  // Safari overrides
  loadSafariHistoryImpl?: () => Promise<ImportedHistoryEntry[]>;
  loadSafariCookiesImpl?: () => Promise<ImportedBrowserCookie[]>;
  detectSafariAccessImpl?: (mode: BrowserImportMode) => Promise<BrowserAccessResult>;
  // Zen overrides
  loadZenHistoryImpl?: (profilePath: string) => Promise<ImportedHistoryEntry[]>;
  loadZenCookiesImpl?: (profilePath: string) => Promise<ImportedBrowserCookie[]>;
  statPathImpl?: (path: string) => { isFile: () => boolean; isDirectory: () => boolean };
};

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class BrowserImportServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BrowserImportServiceError";
  }
}

// ---------------------------------------------------------------------------
// Exported utility functions
// ---------------------------------------------------------------------------

export function dedupeHistoryEntries(entries: ImportedHistoryEntry[]): ImportedHistoryEntry[] {
  const seen = new Set<string>();
  const deduped: ImportedHistoryEntry[] = [];

  for (const entry of entries) {
    const key = [entry.source, entry.browserProfile ?? "", entry.url, String(entry.visitedAt)].join(
      "::",
    );
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped.toSorted((left, right) => right.visitedAt - left.visitedAt);
}

export function toElectronCookieInput(cookie: ImportedBrowserCookie): ImportedCookieInput {
  const rawHost = cookie.domain ?? cookie.host ?? "";
  const normalizedDomain = rawHost.replace(/^\./, "");
  const isDomainCookie = cookie.hostOnly
    ? false
    : typeof cookie.domain === "string" || rawHost.startsWith(".");
  const isHostOnlyCookie = Boolean(normalizedDomain) && !isDomainCookie;
  const normalizedPath = cookie.path && cookie.path.startsWith("/") ? cookie.path : "/";
  const protocol = cookie.secure ? "https" : "http";
  const url = `${protocol}://${normalizedDomain || "localhost"}${normalizedPath}`;
  const expirationDate = cookie.expires ?? cookie.expiresAt ?? undefined;
  const sameSite = cookie.sameSite ? toElectronSameSite(cookie.sameSite) : undefined;

  return {
    url,
    name: cookie.name,
    value: cookie.value,
    path: normalizedPath,
    secure: cookie.secure ?? false,
    httpOnly: cookie.httpOnly ?? false,
    ...(isDomainCookie && normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(typeof expirationDate === "number" ? { expirationDate } : {}),
    ...(sameSite ? { sameSite } : {}),
    ...(isHostOnlyCookie ? { hostOnly: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// profiles.ini parser (Zen / Firefox)
// ---------------------------------------------------------------------------

export function parseProfilesIni(
  iniContent: string,
): Array<{ name: string; path: string; isRelative: boolean }> {
  const profiles: Array<{ name: string; path: string; isRelative: boolean }> = [];
  let current: { name?: string; path?: string; isRelative?: boolean } | null = null;
  let isProfileSection = false;

  for (const rawLine of iniContent.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("[")) {
      if (isProfileSection && current?.name && current.path) {
        profiles.push({
          name: current.name,
          path: current.path,
          isRelative: current.isRelative ?? true,
        });
      }

      isProfileSection = /^\[Profile\d+\]$/i.test(line);
      current = isProfileSection ? {} : null;
      continue;
    }

    if (!isProfileSection || !current) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    if (key === "Name") {
      current.name = value;
    } else if (key === "Path") {
      current.path = value;
    } else if (key === "IsRelative") {
      current.isRelative = value === "1";
    }
  }

  // Flush last profile section
  if (isProfileSection && current?.name && current.path) {
    profiles.push({
      name: current.name,
      path: current.path,
      isRelative: current.isRelative ?? true,
    });
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// BrowserImportService
// ---------------------------------------------------------------------------

export class BrowserImportService {
  private readonly chromiumRoots: Record<ChromiumBrowserTarget, string>;
  private readonly zenRoot: string;
  private readonly safariPaths: { cookiesFile?: string; historyDb?: string };
  private readonly getCookiesImpl: GetCookiesImpl | null;
  private readonly loadChromiumHistoryImpl: (
    profilePath: string,
    browser: ChromiumBrowserTarget,
  ) => Promise<ImportedHistoryEntry[]>;
  private readonly loadSafariHistoryImpl: () => Promise<ImportedHistoryEntry[]>;
  private readonly loadChromiumCookiesImpl: (
    profilePath: string,
    browser: ChromiumBrowserTarget,
  ) => Promise<ImportedBrowserCookie[]>;
  private readonly loadSafariCookiesImpl: () => Promise<ImportedBrowserCookie[]>;
  private readonly detectSafariAccessImpl: (
    mode: BrowserImportMode,
  ) => Promise<BrowserAccessResult>;
  private readonly loadZenHistoryImpl: (profilePath: string) => Promise<ImportedHistoryEntry[]>;
  private readonly loadZenCookiesImpl: (profilePath: string) => Promise<ImportedBrowserCookie[]>;
  private readonly statPathImpl: (path: string) => {
    isFile: () => boolean;
    isDirectory: () => boolean;
  };

  constructor(private readonly deps: BrowserImportServiceDeps) {
    const roots: Record<string, string> = {};
    for (const browser of Object.keys(CHROMIUM_KEYCHAINS) as ChromiumBrowserTarget[]) {
      roots[browser] = deps.chromiumRoots?.[browser] ?? CHROMIUM_KEYCHAINS[browser].root;
    }
    this.chromiumRoots = roots as Record<ChromiumBrowserTarget, string>;
    this.zenRoot = deps.zenRoot ?? ZEN_ROOT;

    const cookiesFile =
      deps.safariPaths?.cookiesFile ??
      SAFARI_COOKIE_CANDIDATES.find((candidate) => existsSync(candidate));
    this.safariPaths = {
      ...(cookiesFile ? { cookiesFile } : {}),
      historyDb: deps.safariPaths?.historyDb ?? SAFARI_HISTORY_DB,
    };
    this.getCookiesImpl = deps.getCookiesImpl ?? null;
    this.loadChromiumHistoryImpl =
      deps.loadChromiumHistoryImpl ??
      ((profilePath, browser) => this.loadChromiumHistory(profilePath, browser));
    this.loadSafariHistoryImpl = deps.loadSafariHistoryImpl ?? (() => this.loadSafariHistory());
    this.loadChromiumCookiesImpl =
      deps.loadChromiumCookiesImpl ??
      ((profilePath, browser) => this.loadChromiumCookies(profilePath, browser));
    this.loadSafariCookiesImpl = deps.loadSafariCookiesImpl ?? (() => this.loadSafariCookies());
    this.detectSafariAccessImpl =
      deps.detectSafariAccessImpl ?? ((mode) => this.detectSafariAccessFromFs(mode));
    this.loadZenHistoryImpl =
      deps.loadZenHistoryImpl ?? ((profilePath) => this.loadZenHistory(profilePath));
    this.loadZenCookiesImpl =
      deps.loadZenCookiesImpl ?? ((profilePath) => this.loadZenCookies(profilePath));
    this.statPathImpl = deps.statPathImpl ?? ((path) => statSync(path));
  }

  // -----------------------------------------------------------------------
  // Public API: generic routing by BrowserImportSource
  // -----------------------------------------------------------------------

  async listProfiles(browser: BrowserImportSource): Promise<BrowserProfileDescriptor[]> {
    const chromiumTarget = IMPORT_SOURCE_TO_CHROMIUM[browser];
    if (chromiumTarget) {
      return this.listChromiumProfiles(chromiumTarget, browser);
    }

    if (browser === "zen") {
      return this.listZenProfiles();
    }

    // Safari has no profiles
    return [];
  }

  async importBrowser(
    browser: BrowserImportSource,
    profilePath: string | null,
    mode: BrowserImportMode = "everything",
  ): Promise<BrowserImportResult> {
    const chromiumTarget = IMPORT_SOURCE_TO_CHROMIUM[browser];
    if (chromiumTarget) {
      return this.importChromium(chromiumTarget, browser, profilePath ?? "", mode);
    }

    if (browser === "safari") {
      return this.importSafari(mode);
    }

    if (browser === "zen") {
      return this.importZen(profilePath ?? "", mode);
    }

    return {
      ok: false,
      code: "UNSUPPORTED_BROWSER",
      importedCookies: 0,
      importedHistory: 0,
      message: `Browser "${browser}" is not supported for import.`,
    };
  }

  async detectAccess(
    browser: BrowserImportSource,
    mode: BrowserImportMode = "everything",
  ): Promise<BrowserAccessResult> {
    if (browser === "safari") {
      return this.detectSafariAccessImpl(mode);
    }

    // No special access checks needed for Chromium or Zen browsers
    return { ok: true };
  }

  async clearBrowsingData(
    target: "cookies" | "history" | "cache" | "everything",
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const session = this.deps.sessionManager.getSession() as CookieWriter & {
        clearStorageData: (options?: { storages?: string[] }) => Promise<void>;
        clearCache: () => Promise<void>;
      };

      if (target === "cookies" || target === "everything") {
        await session.clearStorageData({ storages: ["cookies"] });
      }

      if (target === "history" || target === "everything") {
        this.deps.historyService.clearAll();
      }

      if (target === "cache" || target === "everything") {
        await session.clearCache();
        await session.clearStorageData({
          storages: ["cachestorage", "serviceworkers"],
        });
      }

      if (target === "everything") {
        await session.clearStorageData({
          storages: ["localstorage", "indexdb", "websql", "shadercache"],
        });
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Chromium import (Chrome, Arc)
  // -----------------------------------------------------------------------

  private async listChromiumProfiles(
    target: ChromiumBrowserTarget,
    source: BrowserImportSource,
  ): Promise<BrowserProfileDescriptor[]> {
    const root = this.chromiumRoots[target];
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

  private async importChromium(
    target: ChromiumBrowserTarget,
    source: BrowserImportSource,
    profilePath: string,
    mode: BrowserImportMode,
  ): Promise<BrowserImportResult> {
    const errorPrefix = source.toUpperCase();
    let importedHistory = 0;

    try {
      const result = await this.runImportMode(mode, {
        loadHistory: () => this.loadChromiumHistoryImpl(profilePath, target),
        loadCookies: () => this.loadChromiumCookiesImpl(profilePath, target),
        onHistoryImported: (count) => {
          importedHistory = count;
        },
      });

      return { ok: true, ...result };
    } catch (error) {
      return this.toImportFailureResult(error, `${errorPrefix}_IMPORT_FAILED`, {
        cookieWriteCode: `${errorPrefix}_COOKIE_IMPORT_FAILED`,
        importedHistory,
      });
    }
  }

  private async loadChromiumCookies(
    profilePath: string,
    target: ChromiumBrowserTarget,
  ): Promise<ImportedBrowserCookie[]> {
    if (!this.getCookiesImpl) {
      return loadChromiumCookiesFromProfileSnapshot(profilePath, target);
    }

    const errorPrefix = target.toUpperCase();

    try {
      const result = await this.getCookiesImpl({
        browsers: ["chrome"],
        chromeProfile: profilePath,
        chromiumBrowser: target,
        includeExpired: false,
      } as GetCookiesOptions);

      const keychainWarning = result.warnings.find((warning) => /keychain/i.test(warning));
      if (keychainWarning) {
        throw new BrowserImportServiceError(
          `${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`,
          keychainWarning,
          true,
        );
      }

      const providerWarning = result.warnings[0];
      if (providerWarning) {
        throw new BrowserImportServiceError(`${errorPrefix}_COOKIE_IMPORT_FAILED`, providerWarning);
      }

      return result.cookies;
    } catch (error) {
      if (error instanceof BrowserImportServiceError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (/keychain/i.test(message)) {
        throw new BrowserImportServiceError(
          `${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`,
          message,
          true,
        );
      }

      throw new BrowserImportServiceError(`${errorPrefix}_COOKIE_IMPORT_FAILED`, message);
    }
  }

  private async loadChromiumHistory(
    profilePath: string,
    target: ChromiumBrowserTarget,
  ): Promise<ImportedHistoryEntry[]> {
    const historyDbPath = join(profilePath, "History");
    if (!existsSync(historyDbPath)) {
      return [];
    }

    const rows = await queryHistoryDb(
      historyDbPath,
      `
      SELECT urls.url AS url, urls.title AS title, CAST(visits.visit_time AS TEXT) AS visited_at
      FROM visits
      INNER JOIN urls ON urls.id = visits.url
      ORDER BY visits.visit_time DESC
    `,
    );

    const browserProfile = basename(profilePath);
    const source = HISTORY_SOURCES[target as BrowserImportSource] ?? `${target}-import`;
    const entries: ImportedHistoryEntry[] = [];

    for (const row of rows) {
      const url = asString(row.url);
      const visitedAt = chromeTimeToUnixMs(row.visited_at);
      if (!url || !Number.isFinite(visitedAt)) {
        continue;
      }

      entries.push({
        url,
        title: asString(row.title) ?? url,
        visitedAt,
        source,
        browserProfile,
      });
    }

    return entries;
  }

  // -----------------------------------------------------------------------
  // Safari import
  // -----------------------------------------------------------------------

  private async importSafari(mode: BrowserImportMode): Promise<BrowserImportResult> {
    const safariAccess = await this.detectSafariAccessImpl(mode);
    if (!safariAccess.ok) {
      return {
        ok: false,
        code: safariAccess.code,
        importedCookies: 0,
        importedHistory: 0,
        message: safariAccess.message,
      };
    }

    let importedHistory = 0;

    try {
      const result = await this.runImportMode(mode, {
        loadHistory: () => this.loadSafariHistoryImpl(),
        loadCookies: () => this.loadSafariCookiesImpl(),
        onHistoryImported: (count) => {
          importedHistory = count;
        },
      });

      return { ok: true, ...result };
    } catch (error) {
      return this.toImportFailureResult(error, "SAFARI_IMPORT_FAILED", {
        cookieWriteCode: "SAFARI_COOKIE_IMPORT_FAILED",
        importedHistory,
      });
    }
  }

  private async loadSafariCookies(): Promise<ImportedBrowserCookie[]> {
    if (!this.getCookiesImpl) {
      return loadSafariCookiesFromSnapshot(this.safariPaths.cookiesFile);
    }

    const cookiesFile = this.safariPaths.cookiesFile;
    if (!cookiesFile || !existsSync(cookiesFile)) {
      return [];
    }

    const snapshot = copyFileToTemp(cookiesFile);

    try {
      const result = await this.getCookiesImpl({
        browsers: ["safari"],
        safariCookiesFile: snapshot.filePath,
        includeExpired: false,
      } as GetCookiesOptions);

      const providerWarning = result.warnings[0];
      if (providerWarning) {
        throw new BrowserImportServiceError("SAFARI_COOKIE_IMPORT_FAILED", providerWarning);
      }

      return result.cookies;
    } catch (error) {
      if (error instanceof BrowserImportServiceError) {
        throw error;
      }

      throw new BrowserImportServiceError(
        "SAFARI_COOKIE_IMPORT_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      snapshot.cleanup();
    }
  }

  private async loadSafariHistory(): Promise<ImportedHistoryEntry[]> {
    const historyDbPath = this.safariPaths.historyDb;
    if (!historyDbPath || !existsSync(historyDbPath)) {
      return [];
    }

    const rows = await queryHistoryDb(
      historyDbPath,
      `
      SELECT history_items.url AS url, history_visits.title AS title, CAST(history_visits.visit_time AS TEXT) AS visited_at
      FROM history_visits
      INNER JOIN history_items ON history_items.id = history_visits.history_item
      ORDER BY history_visits.visit_time DESC
    `,
    );

    const entries: ImportedHistoryEntry[] = [];

    for (const row of rows) {
      const url = asString(row.url);
      const visitedAt = safariTimeToUnixMs(row.visited_at);
      if (!url || !Number.isFinite(visitedAt)) {
        continue;
      }

      entries.push({
        url,
        title: asString(row.title) ?? url,
        visitedAt,
        source: HISTORY_SOURCES.safari,
      });
    }

    return entries;
  }

  private async detectSafariAccessFromFs(mode: BrowserImportMode): Promise<BrowserAccessResult> {
    const protectedPaths = [
      ...(mode !== "history" ? [this.safariPaths.cookiesFile] : []),
      ...(mode !== "cookies" ? [this.safariPaths.historyDb] : []),
    ].filter((value): value is string => Boolean(value));

    for (const path of protectedPaths) {
      try {
        this.statPathImpl(path);
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

  // -----------------------------------------------------------------------
  // Zen import (Firefox-based)
  // -----------------------------------------------------------------------

  private async listZenProfiles(): Promise<BrowserProfileDescriptor[]> {
    const profilesIniPath = join(this.zenRoot, "profiles.ini");
    if (!existsSync(profilesIniPath)) {
      return [];
    }

    try {
      const iniContent = readFileSync(profilesIniPath, "utf8");
      const parsed = parseProfilesIni(iniContent);

      return parsed
        .map((profile) => ({
          name: profile.name,
          path: profile.isRelative ? join(this.zenRoot, profile.path) : profile.path,
          browser: "zen" as const,
        }))
        .filter((profile) => hasZenImportableData(profile.path))
        .toSorted((left, right) => left.name.localeCompare(right.name));
    } catch (err) {
      console.warn("[browser-import] Zen profile discovery failed:", err);
      return [];
    }
  }

  private async importZen(
    profilePath: string,
    mode: BrowserImportMode,
  ): Promise<BrowserImportResult> {
    let importedHistory = 0;

    try {
      const result = await this.runImportMode(mode, {
        loadHistory: () => this.loadZenHistoryImpl(profilePath),
        loadCookies: () => this.loadZenCookiesImpl(profilePath),
        onHistoryImported: (count) => {
          importedHistory = count;
        },
      });

      return { ok: true, ...result };
    } catch (error) {
      return this.toImportFailureResult(error, "ZEN_IMPORT_FAILED", {
        cookieWriteCode: "ZEN_COOKIE_IMPORT_FAILED",
        importedHistory,
      });
    }
  }

  private async loadZenCookies(profilePath: string): Promise<ImportedBrowserCookie[]> {
    const dbPath = join(profilePath, "cookies.sqlite");
    if (!existsSync(dbPath)) {
      return [];
    }

    const snapshot = copyDatabaseToTemp(dbPath);

    try {
      const db = await openReadonlyDatabase(snapshot.dbPath);
      try {
        const rows = db.query(
          "SELECT name, value, host, path, CAST(expiry AS TEXT) AS expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies",
        );
        return collectFirefoxCookies(rows, basename(profilePath));
      } finally {
        db.close();
      }
    } catch (error) {
      throw new BrowserImportServiceError(
        "ZEN_COOKIE_IMPORT_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      snapshot.cleanup();
    }
  }

  private async loadZenHistory(profilePath: string): Promise<ImportedHistoryEntry[]> {
    const dbPath = join(profilePath, "places.sqlite");
    if (!existsSync(dbPath)) {
      return [];
    }

    const rows = await queryHistoryDb(
      dbPath,
      `
      SELECT moz_places.url AS url, moz_places.title AS title, CAST(moz_historyvisits.visit_date AS TEXT) AS visited_at
      FROM moz_historyvisits
      INNER JOIN moz_places ON moz_places.id = moz_historyvisits.place_id
      ORDER BY moz_historyvisits.visit_date DESC
    `,
    );

    const browserProfile = basename(profilePath);
    const entries: ImportedHistoryEntry[] = [];

    for (const row of rows) {
      const url = asString(row.url);
      const visitedAt = firefoxTimeToUnixMs(row.visited_at);
      if (!url || !Number.isFinite(visitedAt)) {
        continue;
      }

      entries.push({
        url,
        title: asString(row.title) ?? url,
        visitedAt,
        source: HISTORY_SOURCES.zen,
        browserProfile,
      });
    }

    return entries;
  }

  // -----------------------------------------------------------------------
  // Shared import helpers
  // -----------------------------------------------------------------------

  private async runImportMode(
    mode: BrowserImportMode,
    loaders: {
      loadHistory: () => Promise<ImportedHistoryEntry[]>;
      loadCookies: () => Promise<ImportedBrowserCookie[]>;
      onHistoryImported?: (count: number) => void;
    },
  ): Promise<{ importedCookies: number; importedHistory: number }> {
    let importedHistory = 0;

    if (mode !== "cookies") {
      const historyEntries = dedupeHistoryEntries(await loaders.loadHistory());
      importedHistory = this.importHistory(historyEntries);
      loaders.onHistoryImported?.(importedHistory);
    }

    let importedCookies = 0;
    if (mode !== "history") {
      const cookies = await loaders.loadCookies();
      importedCookies = await this.importCookies(cookies);
    }

    return { importedCookies, importedHistory };
  }

  private toImportFailureResult(
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

  private async importCookies(cookies: ImportedBrowserCookie[]): Promise<number> {
    const electronCookies = cookies.map(
      (cookie) => toElectronCookieInput(cookie) as ImportedCookieInput,
    );
    const session = this.deps.sessionManager.getSession() as CookieWriter;
    const appliedCookies: Electron.CookiesSetDetails[] = [];
    const previousCookies = await snapshotExistingCookies(session, electronCookies);

    try {
      for (const cookie of electronCookies) {
        await session.cookies.set(cookie);
        appliedCookies.push(cookie);
      }

      if (electronCookies.length > 0) {
        await session.cookies.flushStore();
      }

      return electronCookies.length;
    } catch (error) {
      await rollbackImportedCookies(session, appliedCookies, previousCookies);
      throw new BrowserImportServiceError(
        "COOKIE_WRITE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private importHistory(entries: ImportedHistoryEntry[]): number {
    if (entries.length === 0) {
      return 0;
    }

    this.deps.historyService.importEntries(entries);
    return entries.length;
  }
}

// ---------------------------------------------------------------------------
// File / database helpers
// ---------------------------------------------------------------------------

function copyDatabaseToTemp(dbPath: string): { dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-browser-import-"));
  const tempDbPath = join(tempDir, basename(dbPath));

  copyFileSync(dbPath, tempDbPath);
  copyOptionalSidecar(dbPath, tempDbPath, "-wal");
  copyOptionalSidecar(dbPath, tempDbPath, "-shm");

  return {
    dbPath: tempDbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function copyFileToTemp(filePath: string): { filePath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-browser-import-"));
  const tempFilePath = join(tempDir, basename(filePath));
  copyFileSync(filePath, tempFilePath);

  return {
    filePath: tempFilePath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function copyOptionalSidecar(sourceDbPath: string, tempDbPath: string, suffix: string): void {
  const sidecarPath = `${sourceDbPath}${suffix}`;
  if (!existsSync(sidecarPath)) {
    return;
  }

  try {
    copyFileSync(sidecarPath, `${tempDbPath}${suffix}`);
  } catch (err) {
    console.warn(`[browser-import] Sidecar copy (${suffix}) failed:`, err);
  }
}

async function queryHistoryDb(
  dbPath: string,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const snapshot = copyDatabaseToTemp(dbPath);

  try {
    const db = await openReadonlyDatabase(snapshot.dbPath);
    try {
      return db.query(sql);
    } finally {
      db.close();
    }
  } finally {
    snapshot.cleanup();
  }
}

// ---------------------------------------------------------------------------
// Timestamp conversion
// ---------------------------------------------------------------------------

function chromeTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric / 1000 - 11_644_473_600_000);
}

function safariTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null) {
    return 0;
  }

  return Math.round((numeric + 978_307_200) * 1000);
}

/**
 * Firefox/Zen stores visit_date as microseconds since Unix epoch.
 */
function firefoxTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric / 1000);
}

/**
 * Normalize Firefox/Zen cookie expiry to seconds since Unix epoch.
 * Zen may store expiry in milliseconds (values > 10^12), while standard
 * Firefox uses seconds.
 */
function normalizeFirefoxExpiryToSeconds(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return undefined;
  }

  // Milliseconds (13+ digits) -> convert to seconds
  if (numeric > 1_000_000_000_000) {
    return Math.round(numeric / 1000);
  }

  // Already in seconds
  return Math.round(numeric);
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  if (typeof value === "string") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// SQLite abstraction
// ---------------------------------------------------------------------------

type ReadonlyDatabase = {
  query: (sql: string) => Array<Record<string, unknown>>;
  close: () => void;
};

async function openReadonlyDatabase(dbPath: string): Promise<ReadonlyDatabase> {
  if ("Bun" in globalThis) {
    const bunSqlite = await importBunSqlite();
    const db = new bunSqlite.Database(dbPath, { readonly: true });
    return {
      query: (sql) => db.query(sql).all() as Array<Record<string, unknown>>,
      close: () => db.close(),
    };
  }

  const nodeSqlite = await import("node:sqlite");
  const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true, readBigInts: true });
  return {
    query: (sql) => db.prepare(sql).all() as Array<Record<string, unknown>>,
    close: () => db.close(),
  };
}

async function importBunSqlite(): Promise<{
  Database: new (
    path: string,
    options: { readonly: boolean },
  ) => {
    query: (sql: string) => { all: () => Array<Record<string, unknown>> };
    close: () => void;
  };
}> {
  return (0, eval)("import('bun:sqlite')") as Promise<{
    Database: new (
      path: string,
      options: { readonly: boolean },
    ) => {
      query: (sql: string) => { all: () => Array<Record<string, unknown>> };
      close: () => void;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Cookie snapshot & rollback
// ---------------------------------------------------------------------------

async function snapshotExistingCookies(
  session: CookieWriter,
  cookies: ImportedCookieInput[],
): Promise<Map<string, ImportedCookieSnapshot>> {
  const getCookies = session.cookies.get;
  if (typeof getCookies !== "function") {
    return new Map();
  }

  const snapshots = new Map<string, ImportedCookieSnapshot>();

  for (const cookie of cookies) {
    const key = toCookieSnapshotKey(cookie);
    if (snapshots.has(key) || !cookie.url || !cookie.name) {
      continue;
    }

    try {
      const existing = await getCookies({ url: cookie.url, name: cookie.name });
      const expectedHostOnly = !("domain" in cookie);
      const matching = existing.find((candidate) => {
        const samePath = (candidate.path ?? "/") === (cookie.path ?? "/");
        const sameHostOnly = Boolean(candidate.hostOnly) === expectedHostOnly;
        const candidateSnapshot = fromElectronCookie(candidate);
        const sameUrl = candidateSnapshot.url === cookie.url;
        return samePath && sameHostOnly && sameUrl;
      });
      if (matching) {
        snapshots.set(key, fromElectronCookie(matching));
      }
    } catch (err) {
      console.warn("[browser-import] Cookie snapshot lookup failed:", err);
    }
  }

  return snapshots;
}

async function rollbackImportedCookies(
  session: CookieWriter,
  cookies: ImportedCookieInput[],
  previousCookies: Map<string, ImportedCookieSnapshot>,
): Promise<void> {
  const removeCookie = session.cookies.remove;
  const removedFamilies = new Set<string>();

  for (const cookie of cookies.toReversed()) {
    if (!cookie.url || !cookie.name) {
      continue;
    }

    const familyKey = `${cookie.name}|${cookie.url}`;
    if (typeof removeCookie === "function" && !removedFamilies.has(familyKey)) {
      removedFamilies.add(familyKey);
      try {
        await removeCookie(cookie.url, cookie.name);
      } catch (err) {
        console.warn("[browser-import] Cookie rollback removal failed:", err);
      }
    }

    const previous = previousCookies.get(toCookieSnapshotKey(cookie));
    if (!previous) {
      continue;
    }

    try {
      await session.cookies.set(previous);
    } catch (err) {
      console.warn("[browser-import] Cookie rollback restore failed:", err);
    }
  }

  if (cookies.length > 0) {
    try {
      await session.cookies.flushStore();
    } catch (err) {
      console.warn("[browser-import] Cookie store flush during rollback failed:", err);
    }
  }
}

function toCookieSnapshotKey(
  cookie: Pick<Electron.CookiesSetDetails, "url" | "name" | "path"> & { hostOnly?: boolean },
): string {
  return `${cookie.name}|${cookie.url ?? ""}|${cookie.path ?? "/"}|${cookie.hostOnly ? "host" : "domain"}`;
}

function fromElectronCookie(cookie: Electron.Cookie): ImportedCookieSnapshot {
  const normalizedDomain = (cookie.domain ?? "").replace(/^\./, "");
  const protocol = cookie.secure ? "https" : "http";
  const path = cookie.path && cookie.path.startsWith("/") ? cookie.path : "/";
  const sameSite = cookie.sameSite
    ? (cookie.sameSite as Electron.CookiesSetDetails["sameSite"])
    : undefined;

  return {
    url: `${protocol}://${normalizedDomain || "localhost"}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: cookie.secure ?? false,
    httpOnly: cookie.httpOnly ?? false,
    ...(!cookie.hostOnly && normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(!cookie.session && typeof cookie.expirationDate === "number"
      ? { expirationDate: cookie.expirationDate }
      : {}),
    ...(sameSite ? { sameSite } : {}),
    ...(cookie.hostOnly ? { hostOnly: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Chromium profile helpers
// ---------------------------------------------------------------------------

function readChromiumProfileMetadata(root: string): Record<string, string> {
  const localStatePath = join(root, "Local State");
  if (!existsSync(localStatePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(localStatePath, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    const infoCache = parsed.profile?.info_cache ?? {};
    return Object.fromEntries(
      Object.entries(infoCache)
        .filter(([, value]) => typeof value?.name === "string" && value.name.length > 0)
        .map(([key, value]) => [key, value.name as string]),
    );
  } catch (err) {
    console.warn("[browser-import] Chromium profile name parsing failed:", err);
    return {};
  }
}

function hasChromiumImportableData(profilePath: string): boolean {
  return (
    existsSync(join(profilePath, "History")) ||
    existsSync(join(profilePath, "Network", "Cookies")) ||
    existsSync(join(profilePath, "Cookies"))
  );
}

function hasZenImportableData(profilePath: string): boolean {
  return (
    existsSync(join(profilePath, "places.sqlite")) ||
    existsSync(join(profilePath, "cookies.sqlite"))
  );
}

// ---------------------------------------------------------------------------
// Chromium cookie SQLite (direct decryption fallback)
// ---------------------------------------------------------------------------

async function loadChromiumCookiesFromProfileSnapshot(
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
    const errorPrefix = target.toUpperCase();
    const message = error instanceof Error ? error.message : String(error);
    if (/keychain/i.test(message)) {
      throw new BrowserImportServiceError(`${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`, message, true);
    }

    throw new BrowserImportServiceError(`${errorPrefix}_COOKIE_IMPORT_FAILED`, message);
  } finally {
    snapshot.cleanup();
  }
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
    throw new BrowserImportServiceError(
      "SAFARI_COOKIE_IMPORT_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    snapshot.cleanup();
  }
}

function resolveChromeCookiesDbPath(profilePath: string): string | null {
  const candidates = [join(profilePath, "Network", "Cookies"), join(profilePath, "Cookies")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function readChromeSafeStorageKey(target: ChromiumBrowserTarget): Buffer {
  const keychain = CHROMIUM_KEYCHAINS[target];
  const args = ["find-generic-password", "-w", "-a", keychain.account, "-s", keychain.service];

  try {
    const password = execFileSync("security", args, {
      encoding: "utf8",
      timeout: CHROME_SAFE_STORAGE_TIMEOUT_MS,
    }).trim();
    if (!password) {
      throw new Error(`Failed to read macOS Keychain (${keychain.label}): empty password.`);
    }

    return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read macOS Keychain (${keychain.label}): ${message}`, {
      cause: error,
    });
  }
}

async function readChromiumMetaVersion(dbPath: string): Promise<number> {
  const db = await openReadonlyDatabase(dbPath);

  try {
    const rows = db.query(`SELECT value FROM meta WHERE key = 'version' LIMIT 1`);
    const value = rows[0]?.value;
    return asNumber(value) ?? 0;
  } catch (err) {
    console.warn("[browser-import] Chromium meta version query failed:", err);
    return 0;
  } finally {
    db.close();
  }
}

async function queryCookieDb(dbPath: string): Promise<Array<Record<string, unknown>>> {
  const db = await openReadonlyDatabase(dbPath);

  try {
    return db.query(
      "SELECT name, value, host_key, path, CAST(expires_utc AS TEXT) AS expires_utc, samesite, encrypted_value, is_secure, is_httponly FROM cookies ORDER BY expires_utc DESC",
    );
  } finally {
    db.close();
  }
}

export function collectChromiumCookies(
  rows: Array<Record<string, unknown>>,
  options: {
    browser: string;
    profile: string;
    includeExpired: boolean;
    decrypt: (encryptedValue: Uint8Array) => string | null;
  },
): ImportedBrowserCookie[] {
  const cookies: ImportedBrowserCookie[] = [];
  const seen = new Set<string>();
  const now = Math.floor(Date.now() / 1000);

  for (const row of rows) {
    const name = asString(row.name);
    const hostKey = asString(row.host_key);
    if (!name || !hostKey) {
      continue;
    }

    let value = typeof row.value === "string" ? row.value : "";
    if (!value) {
      const encryptedValue = row.encrypted_value instanceof Uint8Array ? row.encrypted_value : null;
      if (!encryptedValue) {
        continue;
      }

      value = options.decrypt(encryptedValue) ?? "";
      if (!value) {
        continue;
      }
    }

    const expires = normalizeExpirationSeconds(row.expires_utc);
    if (!options.includeExpired && expires && expires < now) {
      continue;
    }

    const domain = hostKey.replace(/^\./, "");
    const hostOnly = !hostKey.startsWith(".");
    const path = asString(row.path) ?? "/";
    const key = `${name}|${domain}|${path}|${hostOnly ? "host" : "domain"}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const sameSite = normalizeChromiumSameSite(row.samesite);
    cookies.push({
      name,
      value,
      ...(domain ? { domain } : {}),
      path,
      ...(hostOnly ? { hostOnly: true } : {}),
      secure: isTruthyDbFlag(row.is_secure),
      httpOnly: isTruthyDbFlag(row.is_httponly),
      ...(expires ? { expires } : {}),
      ...(sameSite ? { sameSite } : {}),
      source: {
        browser: options.browser as BrowserName,
        profile: options.profile,
      },
    });
  }

  return cookies;
}

// ---------------------------------------------------------------------------
// Firefox / Zen cookie collector
// ---------------------------------------------------------------------------

export function collectFirefoxCookies(
  rows: Array<Record<string, unknown>>,
  profile: string,
): ImportedBrowserCookie[] {
  const cookies: ImportedBrowserCookie[] = [];
  const seen = new Set<string>();
  const now = Math.floor(Date.now() / 1000);

  for (const row of rows) {
    const name = asString(row.name);
    const host = asString(row.host);
    if (!name || !host) {
      continue;
    }

    const value = typeof row.value === "string" ? row.value : "";
    const expires = normalizeFirefoxExpiryToSeconds(row.expiry);
    if (expires && expires < now) {
      continue;
    }

    const domain = host.replace(/^\./, "");
    const hostOnly = !host.startsWith(".");
    const path = asString(row.path) ?? "/";
    const key = `${name}|${domain}|${path}|${hostOnly ? "host" : "domain"}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const sameSite = normalizeFirefoxSameSite(row.sameSite);
    cookies.push({
      name,
      value,
      ...(domain ? { domain } : {}),
      path,
      ...(hostOnly ? { hostOnly: true, host: domain } : {}),
      secure: isTruthyDbFlag(row.isSecure),
      httpOnly: isTruthyDbFlag(row.isHttpOnly),
      ...(expires ? { expires } : {}),
      ...(sameSite ? { sameSite } : {}),
      source: { browser: "firefox" as BrowserName, profile },
    });
  }

  return cookies;
}

function normalizeFirefoxSameSite(value: unknown): SweetCookie["sameSite"] | undefined {
  const numeric = asNumber(value);
  if (numeric === 0) {
    return "None";
  }
  if (numeric === 1) {
    return "Lax";
  }
  if (numeric === 2) {
    return "Strict";
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Chromium cookie decryption
// ---------------------------------------------------------------------------

function decryptChromiumCookieValue(
  encryptedValue: Uint8Array,
  key: Buffer,
  stripHashPrefix: boolean,
): string | null {
  const buf = Buffer.from(encryptedValue);
  if (buf.length < 3) {
    return null;
  }

  const prefix = buf.subarray(0, 3).toString("utf8");
  if (!/^v\d\d$/.test(prefix)) {
    return decodeUtf8CookieValue(buf, false);
  }

  const ciphertext = buf.subarray(3);
  if (!ciphertext.length) {
    return "";
  }

  try {
    const iv = Buffer.alloc(16, 0x20);
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(false);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decodeUtf8CookieValue(removePkcs7Padding(plaintext), stripHashPrefix);
  } catch (err) {
    console.warn("[browser-import] Cookie value decryption failed:", err);
    return null;
  }
}

function decodeUtf8CookieValue(value: Uint8Array, stripHashPrefix: boolean): string | null {
  const bytes = stripHashPrefix && value.length >= 32 ? value.subarray(32) : value;

  try {
    return stripLeadingControlChars(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // Expected: non-UTF-8 byte sequences in cookie values
    return null;
  }
}

function removePkcs7Padding(value: Buffer): Buffer {
  if (!value.length) {
    return value;
  }

  const padding = value[value.length - 1];
  if (!padding || padding > 16) {
    return value;
  }

  return value.subarray(0, value.length - padding);
}

function stripLeadingControlChars(value: string): string {
  let index = 0;
  while (index < value.length && value.charCodeAt(index) < 0x20) {
    index += 1;
  }

  return value.slice(index);
}

function normalizeExpirationSeconds(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return undefined;
  }

  if (numeric > 10_000_000_000_000) {
    return Math.round(numeric / 1_000_000 - 11_644_473_600);
  }

  if (numeric > 10_000_000_000) {
    return Math.round(numeric / 1000);
  }

  return Math.round(numeric);
}

function normalizeChromiumSameSite(value: unknown): SweetCookie["sameSite"] | undefined {
  const numeric = asNumber(value);
  if (numeric === 2) {
    return "Strict";
  }

  if (numeric === 1) {
    return "Lax";
  }

  if (numeric === 0) {
    return "None";
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "strict") {
      return "Strict";
    }
    if (normalized === "lax") {
      return "Lax";
    }
    if (normalized === "none" || normalized === "no_restriction") {
      return "None";
    }
  }

  return undefined;
}

function isTruthyDbFlag(value: unknown): boolean {
  return value === 1 || value === 1n || value === "1" || value === true;
}

// ---------------------------------------------------------------------------
// Safari binary cookie parser
// ---------------------------------------------------------------------------

function decodeSafariBinaryCookies(buffer: Buffer): ImportedBrowserCookie[] {
  if (buffer.length < 8 || buffer.subarray(0, 4).toString("utf8") !== "cook") {
    return [];
  }

  const pageCount = buffer.readUInt32BE(4);
  let cursor = 8;
  const pageSizes: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pageSizes.push(buffer.readUInt32BE(cursor));
    cursor += 4;
  }

  const cookies: ImportedBrowserCookie[] = [];
  for (const pageSize of pageSizes) {
    const page = buffer.subarray(cursor, cursor + pageSize);
    cursor += pageSize;
    cookies.push(...decodeSafariCookiePage(page));
  }

  return dedupeCookies(cookies);
}

export { decodeSafariBinaryCookies };

function decodeSafariCookiePage(page: Buffer): ImportedBrowserCookie[] {
  if (page.length < 16 || page.readUInt32BE(0) !== 0x00000100) {
    return [];
  }

  const cookieCount = page.readUInt32LE(4);
  const offsets: number[] = [];
  let cursor = 8;
  for (let index = 0; index < cookieCount; index += 1) {
    offsets.push(page.readUInt32LE(cursor));
    cursor += 4;
  }

  return offsets
    .map((offset) => decodeSafariCookie(page.subarray(offset)))
    .filter((cookie): cookie is ImportedBrowserCookie => Boolean(cookie));
}

function decodeSafariCookie(cookieBuffer: Buffer): ImportedBrowserCookie | null {
  if (cookieBuffer.length < 48) {
    return null;
  }

  const size = cookieBuffer.readUInt32LE(0);
  if (size < 48 || size > cookieBuffer.length) {
    return null;
  }

  const flagsValue = cookieBuffer.readUInt32LE(8);
  const rawUrl = readCString(cookieBuffer, cookieBuffer.readUInt32LE(16), size);
  const name = readCString(cookieBuffer, cookieBuffer.readUInt32LE(20), size);
  const cookiePath = readCString(cookieBuffer, cookieBuffer.readUInt32LE(24), size) ?? "/";
  const value = readCString(cookieBuffer, cookieBuffer.readUInt32LE(28), size) ?? "";
  if (!name) {
    return null;
  }

  const rawHost = rawUrl ? safeHostnameFromUrl(rawUrl) : undefined;
  const domain = rawHost?.replace(/^\./, "");
  const hostOnly = Boolean(domain) && !String(rawUrl).trim().startsWith(".");
  const expiration = readDoubleLE(cookieBuffer, 40);
  const expires = expiration && expiration > 0 ? Math.round(expiration + 978_307_200) : undefined;

  return {
    name,
    value,
    path: cookiePath,
    secure: (flagsValue & 1) !== 0,
    httpOnly: (flagsValue & 4) !== 0,
    ...(domain ? (hostOnly ? { host: domain, hostOnly: true } : { domain }) : {}),
    ...(expires ? { expires } : {}),
    source: { browser: "safari" },
  };
}

function readDoubleLE(buffer: Buffer, offset: number): number {
  if (offset + 8 > buffer.length) {
    return 0;
  }

  return buffer.subarray(offset, offset + 8).readDoubleLE(0);
}

function readCString(buffer: Buffer, offset: number, end: number): string | null {
  if (offset <= 0 || offset >= end) {
    return null;
  }

  let cursor = offset;
  while (cursor < end && buffer[cursor] !== 0) {
    cursor += 1;
  }

  if (cursor >= end) {
    return null;
  }

  return buffer.toString("utf8", offset, cursor);
}

function safeHostnameFromUrl(raw: string): string | undefined {
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    const parsed = new URL(url);
    return parsed.hostname.startsWith(".") ? parsed.hostname.slice(1) : parsed.hostname;
  } catch {
    // Expected: malformed URL, fall back to raw string cleanup
    const cleaned = raw.trim();
    if (!cleaned) {
      return undefined;
    }

    return cleaned.startsWith(".") ? cleaned.slice(1) : cleaned;
  }
}

function dedupeCookies(cookies: ImportedBrowserCookie[]): ImportedBrowserCookie[] {
  const merged = new Map<string, ImportedBrowserCookie>();
  for (const cookie of cookies) {
    const variant = cookie.hostOnly ? "host" : "domain";
    const key = `${cookie.name}|${cookie.domain ?? cookie.host ?? ""}|${cookie.path ?? ""}|${variant}`;
    if (!merged.has(key)) {
      merged.set(key, cookie);
    }
  }

  return Array.from(merged.values());
}

function toElectronSameSite(value: SweetCookie["sameSite"]): ElectronCookieSameSite {
  if (value === "Strict") {
    return "strict";
  }

  if (value === "Lax") {
    return "lax";
  }

  return "no_restriction";
}

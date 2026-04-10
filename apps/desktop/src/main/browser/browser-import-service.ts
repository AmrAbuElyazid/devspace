import { execFileSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";
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
import type { Cookie as SweetCookie, GetCookiesOptions } from "@steipete/sweet-cookie";
import type {
  BrowserAccessResult,
  BrowserImportMode,
  BrowserImportResult,
  BrowserImportSource,
  BrowserProfileDescriptor,
} from "../../shared/browser";
import type { BrowserHistoryRecorder } from "./browser-history-service";
import type { BrowserSessionManager } from "./browser-session-manager";
import {
  rollbackImportedCookies,
  snapshotExistingCookies,
  type BrowserCookieStore,
} from "./browser-import-cookie-store";
import {
  collectChromiumCookies,
  decryptChromiumCookieValue,
} from "./browser-import-chromium-cookies";
import { collectFirefoxCookies } from "./browser-import-firefox-cookies";
import {
  chromeTimeToUnixMs,
  dedupeHistoryEntries,
  firefoxTimeToUnixMs,
  mapHistoryRows,
  safariTimeToUnixMs,
  type ImportedHistoryEntry,
} from "./browser-import-history";
import {
  hasChromiumImportableData,
  hasZenImportableData,
  parseProfilesIni,
  readChromiumProfileMetadata,
  resolveChromeCookiesDbPath,
} from "./browser-import-profiles";
import { decodeSafariBinaryCookies } from "./browser-import-safari-cookies";

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

type CookieWriter = {
  cookies: BrowserCookieStore;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findKeychainWarning(warnings: string[]): string | undefined {
  return warnings.find((warning) => /keychain/i.test(warning));
}

function throwProviderWarning(code: string, warnings: string[]): void {
  const providerWarning = warnings[0];
  if (providerWarning) {
    throw new BrowserImportServiceError(code, providerWarning);
  }
}

function throwChromiumProviderWarnings(errorPrefix: string, warnings: string[]): void {
  const keychainWarning = findKeychainWarning(warnings);
  if (keychainWarning) {
    throw new BrowserImportServiceError(
      `${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`,
      keychainWarning,
      true,
    );
  }

  throwProviderWarning(`${errorPrefix}_COOKIE_IMPORT_FAILED`, warnings);
}

function throwCookieImportError(code: string, error: unknown): never {
  throw new BrowserImportServiceError(code, errorMessage(error));
}

function throwChromiumCookieImportError(errorPrefix: string, error: unknown): never {
  const message = errorMessage(error);
  if (/keychain/i.test(message)) {
    throw new BrowserImportServiceError(`${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`, message, true);
  }

  throw new BrowserImportServiceError(`${errorPrefix}_COOKIE_IMPORT_FAILED`, message);
}

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

export { parseProfilesIni };
export { collectChromiumCookies };
export { collectFirefoxCookies };
export { decodeSafariBinaryCookies };
export { dedupeHistoryEntries };

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

      throwChromiumProviderWarnings(errorPrefix, result.warnings);

      return result.cookies;
    } catch (error) {
      if (error instanceof BrowserImportServiceError) {
        throw error;
      }

      throwChromiumCookieImportError(errorPrefix, error);
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

    return mapHistoryRows(rows, {
      source: HISTORY_SOURCES[target as BrowserImportSource] ?? `${target}-import`,
      browserProfile: basename(profilePath),
      toVisitedAt: chromeTimeToUnixMs,
    });
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

    return mapHistoryRows(rows, {
      source: HISTORY_SOURCES.safari,
      toVisitedAt: safariTimeToUnixMs,
    });
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

    return mapHistoryRows(rows, {
      source: HISTORY_SOURCES.zen,
      browserProfile: basename(profilePath),
      toVisitedAt: firefoxTimeToUnixMs,
    });
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
    const appliedCookies: ImportedCookieInput[] = [];
    const previousCookies = await snapshotExistingCookies(session.cookies, electronCookies);

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
      await rollbackImportedCookies(session.cookies, appliedCookies, previousCookies);
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
// Value helpers
// ---------------------------------------------------------------------------

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
    throwChromiumCookieImportError(target.toUpperCase(), error);
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
    throwCookieImportError("SAFARI_COOKIE_IMPORT_FAILED", error);
  } finally {
    snapshot.cleanup();
  }
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

function toElectronSameSite(value: SweetCookie["sameSite"]): ElectronCookieSameSite {
  if (value === "Strict") {
    return "strict";
  }

  if (value === "Lax") {
    return "lax";
  }

  return "no_restriction";
}

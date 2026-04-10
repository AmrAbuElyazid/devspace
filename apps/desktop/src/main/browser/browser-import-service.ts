import { statSync } from "node:fs";
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
  CHROME_SAFE_STORAGE_TIMEOUT_MS,
  CHROMIUM_KEYCHAINS,
  IMPORT_SOURCE_TO_CHROMIUM,
  type ChromiumBrowserTarget,
} from "./browser-import-chromium-keychain";
import {
  listChromiumProfiles,
  loadChromiumCookies,
  loadChromiumHistory,
} from "./browser-import-chromium";
import type { ImportedHistoryEntry } from "./browser-import-history";
import { runBrowserImportMode, toImportFailureResult } from "./browser-import-orchestration";
import {
  clearSessionBrowsingData,
  type BrowserCookieSession,
  type BrowsingDataSession,
} from "./browser-import-session";
import {
  detectSafariAccessFromFs,
  loadSafariCookies,
  loadSafariHistory,
  resolveSafariPaths,
} from "./browser-import-safari";
import { ZEN_ROOT, listZenProfiles, loadZenCookies, loadZenHistory } from "./browser-import-zen";

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
// Test-facing helper re-exports
// ---------------------------------------------------------------------------

export { collectChromiumCookies } from "./browser-import-chromium-cookies";
export { toElectronCookieInput } from "./browser-import-electron-cookies";
export { collectFirefoxCookies } from "./browser-import-firefox-cookies";
export { BrowserImportServiceError } from "./browser-import-errors";
export { dedupeHistoryEntries } from "./browser-import-history";
export { parseProfilesIni } from "./browser-import-profiles";
export { decodeSafariBinaryCookies } from "./browser-import-safari-cookies";
export { CHROME_SAFE_STORAGE_TIMEOUT_MS };

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

    this.safariPaths = resolveSafariPaths(deps.safariPaths);
    this.getCookiesImpl = deps.getCookiesImpl ?? null;
    this.loadChromiumHistoryImpl = deps.loadChromiumHistoryImpl ?? loadChromiumHistory;
    this.loadSafariHistoryImpl =
      deps.loadSafariHistoryImpl ?? (() => loadSafariHistory(this.safariPaths.historyDb));
    this.loadChromiumCookiesImpl =
      deps.loadChromiumCookiesImpl ??
      ((profilePath, browser) => loadChromiumCookies(profilePath, browser, this.getCookiesImpl));
    this.loadSafariCookiesImpl =
      deps.loadSafariCookiesImpl ??
      (() => loadSafariCookies(this.safariPaths.cookiesFile, this.getCookiesImpl));
    this.detectSafariAccessImpl =
      deps.detectSafariAccessImpl ??
      ((mode) => detectSafariAccessFromFs(mode, this.safariPaths, this.statPathImpl));
    this.loadZenHistoryImpl = deps.loadZenHistoryImpl ?? loadZenHistory;
    this.loadZenCookiesImpl = deps.loadZenCookiesImpl ?? loadZenCookies;
    this.statPathImpl = deps.statPathImpl ?? ((path) => statSync(path));
  }

  // -----------------------------------------------------------------------
  // Public API: generic routing by BrowserImportSource
  // -----------------------------------------------------------------------

  async listProfiles(browser: BrowserImportSource): Promise<BrowserProfileDescriptor[]> {
    const chromiumTarget = IMPORT_SOURCE_TO_CHROMIUM[browser];
    if (chromiumTarget) {
      return listChromiumProfiles(this.chromiumRoots[chromiumTarget], browser);
    }

    if (browser === "zen") {
      return listZenProfiles(this.zenRoot);
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
    const session = this.deps.sessionManager.getSession() as BrowsingDataSession;
    return clearSessionBrowsingData(session, this.deps.historyService, target);
  }

  // -----------------------------------------------------------------------
  // Chromium import (Chrome, Arc)
  // -----------------------------------------------------------------------

  private async importChromium(
    target: ChromiumBrowserTarget,
    source: BrowserImportSource,
    profilePath: string,
    mode: BrowserImportMode,
  ): Promise<BrowserImportResult> {
    const errorPrefix = source.toUpperCase();
    return this.executeImport(mode, {
      loadHistory: () => this.loadChromiumHistoryImpl(profilePath, target),
      loadCookies: () => this.loadChromiumCookiesImpl(profilePath, target),
      fallbackCode: `${errorPrefix}_IMPORT_FAILED`,
      cookieWriteCode: `${errorPrefix}_COOKIE_IMPORT_FAILED`,
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

    return this.executeImport(mode, {
      loadHistory: () => this.loadSafariHistoryImpl(),
      loadCookies: () => this.loadSafariCookiesImpl(),
      fallbackCode: "SAFARI_IMPORT_FAILED",
      cookieWriteCode: "SAFARI_COOKIE_IMPORT_FAILED",
    });
  }

  // -----------------------------------------------------------------------
  // Zen import (Firefox-based)
  // -----------------------------------------------------------------------

  private async importZen(
    profilePath: string,
    mode: BrowserImportMode,
  ): Promise<BrowserImportResult> {
    return this.executeImport(mode, {
      loadHistory: () => this.loadZenHistoryImpl(profilePath),
      loadCookies: () => this.loadZenCookiesImpl(profilePath),
      fallbackCode: "ZEN_IMPORT_FAILED",
      cookieWriteCode: "ZEN_COOKIE_IMPORT_FAILED",
    });
  }

  private async executeImport(
    mode: BrowserImportMode,
    options: {
      loadHistory: () => Promise<ImportedHistoryEntry[]>;
      loadCookies: () => Promise<ImportedBrowserCookie[]>;
      fallbackCode: string;
      cookieWriteCode: string;
    },
  ): Promise<BrowserImportResult> {
    let importedHistory = 0;

    try {
      const result = await runBrowserImportMode(
        mode,
        {
          loadHistory: options.loadHistory,
          loadCookies: options.loadCookies,
          onHistoryImported: (count) => {
            importedHistory = count;
          },
        },
        {
          historyService: this.deps.historyService,
          getSession: () => this.deps.sessionManager.getSession() as BrowserCookieSession,
        },
      );

      return { ok: true, ...result };
    } catch (error) {
      return toImportFailureResult(error, options.fallbackCode, {
        cookieWriteCode: options.cookieWriteCode,
        importedHistory,
      });
    }
  }
}

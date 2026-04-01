import { test, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowserImportService,
  BrowserImportServiceError,
  CHROME_SAFE_STORAGE_TIMEOUT_MS,
  collectChromiumCookies,
  collectFirefoxCookies,
  decodeSafariBinaryCookies,
  dedupeHistoryEntries,
  parseProfilesIni,
  toElectronCookieInput,
} from "../browser-import-service";

/** Stub historyService with clearAll. */
function stubHistoryService(entries?: unknown[]) {
  return {
    importEntries: (incoming: unknown[]) => {
      entries?.push(...incoming);
      return incoming.length;
    },
    clearAll: () => {
      if (entries) entries.length = 0;
    },
  };
}

/** Stub sessionManager. */
function stubSession(overrides?: Record<string, unknown>) {
  return {
    getSession: () =>
      ({
        cookies: { set: async () => undefined, flushStore: async () => undefined },
        ...overrides,
      }) as never,
  };
}

/** Helper: build a minimal Safari binary cookie record for testing. */
function makeCookie(rawHost: string, name: string, value: string): Buffer {
  const cookieBuffer = Buffer.alloc(160);
  cookieBuffer.writeUInt32LE(160, 0);
  cookieBuffer.writeUInt32LE(0, 4);
  cookieBuffer.writeUInt32LE(0, 8);
  cookieBuffer.writeUInt32LE(48, 12);
  cookieBuffer.writeUInt32LE(64, 16);
  cookieBuffer.writeUInt32LE(96, 20);
  cookieBuffer.writeUInt32LE(112, 24);
  cookieBuffer.writeUInt32LE(120, 28);
  cookieBuffer.writeDoubleLE(0, 40);
  cookieBuffer.write(`${rawHost}\0`, 64, "utf8");
  cookieBuffer.write(`${name}\0`, 96, "utf8");
  cookieBuffer.write("/\0", 112, "utf8");
  cookieBuffer.write(`${value}\0`, 120, "utf8");
  return cookieBuffer;
}

// ---------------------------------------------------------------------------
// History dedup
// ---------------------------------------------------------------------------

test("dedupeHistoryEntries removes exact duplicate imports", () => {
  const result = dedupeHistoryEntries([
    {
      url: "https://example.com",
      title: "Example",
      visitedAt: 1,
      source: "chrome-import",
      browserProfile: "Default",
    },
    {
      url: "https://example.com",
      title: "Example",
      visitedAt: 1,
      source: "chrome-import",
      browserProfile: "Default",
    },
  ]);

  expect(result.length).toBe(1);
});

// ---------------------------------------------------------------------------
// Cookie mapping
// ---------------------------------------------------------------------------

test("toElectronCookieInput maps secure cookie to https URL", () => {
  const cookie = toElectronCookieInput({
    host: ".example.com",
    path: "/",
    name: "sid",
    value: "abc",
    secure: true,
    httpOnly: true,
    expiresAt: null,
  });

  expect(cookie.url).toBe("https://example.com/");
});

test("toElectronCookieInput preserves host-only cookies without widening them to domain cookies", () => {
  const cookie = toElectronCookieInput({
    host: "example.com",
    path: "/",
    name: "sid",
    value: "abc",
  });

  expect(cookie.url).toBe("http://example.com/");
  expect("domain" in cookie).toBe(false);
});

// ---------------------------------------------------------------------------
// profiles.ini parser
// ---------------------------------------------------------------------------

test("parseProfilesIni extracts profile entries from INI content", () => {
  const ini = `
[Install6ED35B3CA1B5D3AF]
Default=Profiles/abc.Default (release)
Locked=1

[Profile1]
Name=default
IsRelative=1
Path=Profiles/xyz.default

[Profile0]
Name=Default (release)
IsRelative=1
Path=Profiles/abc.Default (release)

[General]
StartWithLastProfile=1
Version=2
`;
  const profiles = parseProfilesIni(ini);

  expect(profiles).toEqual([
    { name: "default", path: "Profiles/xyz.default", isRelative: true },
    { name: "Default (release)", path: "Profiles/abc.Default (release)", isRelative: true },
  ]);
});

test("parseProfilesIni handles absolute paths", () => {
  const ini = `
[Profile0]
Name=Custom
IsRelative=0
Path=/Users/test/zen-profile
`;
  const profiles = parseProfilesIni(ini);

  expect(profiles).toEqual([
    { name: "Custom", path: "/Users/test/zen-profile", isRelative: false },
  ]);
});

test("parseProfilesIni returns empty array for empty input", () => {
  expect(parseProfilesIni("")).toEqual([]);
});

// ---------------------------------------------------------------------------
// Chrome profile listing
// ---------------------------------------------------------------------------

test("listProfiles reads available Chrome profile directories", async () => {
  const chromeUserDataDir = mkdtempSync(join(tmpdir(), "devspace-chrome-profiles-"));

  try {
    mkdirSync(join(chromeUserDataDir, "Default"));
    mkdirSync(join(chromeUserDataDir, "Profile 1", "Network"), { recursive: true });
    writeFileSync(join(chromeUserDataDir, "Default", "History"), "");
    writeFileSync(join(chromeUserDataDir, "Profile 1", "Network", "Cookies"), "");
    writeFileSync(
      join(chromeUserDataDir, "Local State"),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: "Personal" },
            "Profile 1": { name: "Work" },
          },
        },
      }),
      "utf8",
    );

    const service = new BrowserImportService({
      chromiumRoots: { chrome: chromeUserDataDir },
      sessionManager: stubSession(),
      historyService: stubHistoryService(),
    });

    const profiles = await service.listProfiles("chrome");

    expect(profiles).toEqual([
      { name: "Personal", path: join(chromeUserDataDir, "Default"), browser: "chrome" },
      { name: "Work", path: join(chromeUserDataDir, "Profile 1"), browser: "chrome" },
    ]);
  } finally {
    rmSync(chromeUserDataDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Arc profile listing
// ---------------------------------------------------------------------------

test("listProfiles reads Arc profiles from Arc user data directory", async () => {
  const arcDir = mkdtempSync(join(tmpdir(), "devspace-arc-profiles-"));

  try {
    mkdirSync(join(arcDir, "Default"));
    writeFileSync(join(arcDir, "Default", "History"), "");
    writeFileSync(
      join(arcDir, "Local State"),
      JSON.stringify({
        profile: { info_cache: { Default: { name: "Main" } } },
      }),
      "utf8",
    );

    const service = new BrowserImportService({
      chromiumRoots: { arc: arcDir },
      sessionManager: stubSession(),
      historyService: stubHistoryService(),
    });

    const profiles = await service.listProfiles("arc");

    expect(profiles).toEqual([{ name: "Main", path: join(arcDir, "Default"), browser: "arc" }]);
  } finally {
    rmSync(arcDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Zen profile listing
// ---------------------------------------------------------------------------

test("listProfiles reads Zen profiles from profiles.ini", async () => {
  const zenDir = mkdtempSync(join(tmpdir(), "devspace-zen-profiles-"));

  try {
    mkdirSync(join(zenDir, "Profiles", "abc.default"), { recursive: true });
    writeFileSync(join(zenDir, "Profiles", "abc.default", "cookies.sqlite"), "");
    writeFileSync(
      join(zenDir, "profiles.ini"),
      `[Profile0]\nName=Default\nIsRelative=1\nPath=Profiles/abc.default\n`,
      "utf8",
    );

    const service = new BrowserImportService({
      zenRoot: zenDir,
      sessionManager: stubSession(),
      historyService: stubHistoryService(),
    });

    const profiles = await service.listProfiles("zen");

    expect(profiles).toEqual([
      { name: "Default", path: join(zenDir, "Profiles", "abc.default"), browser: "zen" },
    ]);
  } finally {
    rmSync(zenDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Chromium import (Chrome)
// ---------------------------------------------------------------------------

test("importBrowser returns retryable keychain failure after importing history", async () => {
  const importedHistory: unknown[] = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(importedHistory),
    loadChromiumHistoryImpl: async () => [
      {
        url: "https://example.com",
        title: "Example",
        visitedAt: 1,
        source: "chrome-import",
        browserProfile: "Default",
      },
    ],
    loadChromiumCookiesImpl: async () => {
      throw new BrowserImportServiceError(
        "CHROME_KEYCHAIN_ACCESS_REQUIRED",
        "Keychain access denied",
        true,
      );
    },
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(importedHistory.length).toBe(1);
  expect(result).toEqual({
    ok: false,
    code: "CHROME_KEYCHAIN_ACCESS_REQUIRED",
    importedCookies: 0,
    importedHistory: 1,
    retryable: true,
    message: "Keychain access denied",
  });
});

test("Chrome keychain lookup timeout allows enough time for interactive auth", () => {
  expect(CHROME_SAFE_STORAGE_TIMEOUT_MS >= 15000).toBeTruthy();
});

test("importBrowser accepts very large Chrome history timestamps from sqlite bigint rows", async () => {
  const importedHistory: unknown[] = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(importedHistory),
    loadChromiumHistoryImpl: async () => [
      {
        url: "https://example.com/large-time",
        title: "Large Time",
        visitedAt: Number(13418806877500541n / 1000n - 11_644_473_600_000n),
        source: "chrome-import",
        browserProfile: "Default",
      },
    ],
    loadChromiumCookiesImpl: async () => [],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default", "history");

  expect(result).toEqual({ ok: true, importedCookies: 0, importedHistory: 1 });
  expect(importedHistory.length).toBe(1);
});

test("collectChromiumCookies accepts oversized Chromium expiration timestamps provided as strings", () => {
  const cookies = collectChromiumCookies(
    [
      {
        name: "sid",
        value: "abc",
        host_key: ".example.com",
        path: "/",
        expires_utc: "13418806877500541",
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
    ],
    {
      browser: "chrome",
      profile: "Default",
      includeExpired: true,
      decrypt: () => null,
    },
  );

  expect(cookies.length).toBe(1);
  expect(typeof cookies[0]?.expires === "number").toBeTruthy();
});

test("importBrowser returns explicit Full Disk Access missing status for Safari", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    detectSafariAccessImpl: async () => ({
      ok: false,
      code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
      message: "Grant Full Disk Access to DevSpace.",
    }),
  });

  const result = await service.importBrowser("safari", null);

  expect(result).toEqual({
    ok: false,
    code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
    importedCookies: 0,
    importedHistory: 0,
    message: "Grant Full Disk Access to DevSpace.",
  });
});

test("importBrowser supports history-only imports without loading cookies", async () => {
  let loadCookiesCalls = 0;
  const importedHistory: unknown[] = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(importedHistory),
    loadChromiumHistoryImpl: async () => [
      {
        url: "https://example.com/history-only",
        title: "History Only",
        visitedAt: 10,
        source: "chrome-import",
        browserProfile: "Default",
      },
    ],
    loadChromiumCookiesImpl: async () => {
      loadCookiesCalls += 1;
      return [];
    },
  });

  const result = await service.importBrowser("chrome", "/tmp/Default", "history");

  expect(loadCookiesCalls).toBe(0);
  expect(importedHistory.length).toBe(1);
  expect(result).toEqual({ ok: true, importedCookies: 0, importedHistory: 1 });
});

test("importBrowser supports cookies-only Safari imports without loading history", async () => {
  let loadSafariHistoryCalls = 0;
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: {
      importEntries: () => {
        throw new Error("history import should not run");
      },
      clearAll: () => {},
    },
    detectSafariAccessImpl: async () => ({ ok: true }),
    loadSafariHistoryImpl: async () => {
      loadSafariHistoryCalls += 1;
      return [];
    },
    loadSafariCookiesImpl: async () => [
      {
        host: ".example.com",
        path: "/",
        name: "sid",
        value: "abc",
      },
    ],
  });

  const result = await service.importBrowser("safari", null, "cookies");

  expect(loadSafariHistoryCalls).toBe(0);
  expect(result).toEqual({ ok: true, importedCookies: 1, importedHistory: 0 });
});

test("detectAccess reports Full Disk Access requirement for protected Safari files", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    safariPaths: {
      cookiesFile: "/Users/example/Library/Cookies/Cookies.binarycookies",
      historyDb: "/Users/example/Library/Safari/History.db",
    },
    statPathImpl: () => {
      const error = new Error("operation not permitted") as Error & { code?: string };
      error.code = "EPERM";
      throw error;
    },
  });

  const result = await service.detectAccess("safari");

  expect(result).toEqual({
    ok: false,
    code: "SAFARI_FULL_DISK_ACCESS_REQUIRED",
    message: "Grant Full Disk Access to DevSpace to import Safari data.",
  });
});

test("importBrowser loads full-profile cookies without a URL slice", async () => {
  const capturedCalls: Array<Record<string, unknown>> = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    getCookiesImpl: async (options) => {
      capturedCalls.push(options as unknown as Record<string, unknown>);
      return {
        cookies: [
          {
            host: ".example.com",
            path: "/",
            name: "sid",
            value: "abc",
          },
        ],
        warnings: [],
      };
    },
    loadChromiumHistoryImpl: async () => [],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(result.ok).toBe(true);
  expect(capturedCalls.length).toBe(1);
  expect("url" in capturedCalls[0]!).toBe(false);
  expect(capturedCalls[0]?.chromeProfile).toBe("/tmp/Default");
});

test("importBrowser copies the Safari cookie file to a temp path before reading it", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "devspace-safari-cookie-copy-"));
  const originalCookieFile = join(tempRoot, "Cookies.binarycookies");
  writeFileSync(originalCookieFile, "cookie-data", "utf8");

  const seenFiles: string[] = [];
  const seenContents: string[] = [];

  try {
    const service = new BrowserImportService({
      sessionManager: stubSession(),
      historyService: stubHistoryService(),
      detectSafariAccessImpl: async () => ({ ok: true }),
      safariPaths: {
        cookiesFile: originalCookieFile,
      },
      getCookiesImpl: async (options) => {
        seenFiles.push(String(options.safariCookiesFile));
        seenContents.push(readFileSync(String(options.safariCookiesFile), "utf8"));
        return { cookies: [], warnings: [] };
      },
      loadSafariHistoryImpl: async () => [],
    });

    const result = await service.importBrowser("safari", null);

    expect(result.ok).toBe(true);
    expect(seenFiles.length).toBe(1);
    expect(seenFiles[0]).not.toBe(originalCookieFile);
    expect(seenContents[0]).toBe("cookie-data");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("importBrowser surfaces provider warnings as structured cookie failures after importing history", async () => {
  const importedHistory: unknown[] = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(importedHistory),
    getCookiesImpl: async () => ({
      cookies: [],
      warnings: ["failed to copy locked cookie database"],
    }),
    loadChromiumHistoryImpl: async () => [
      {
        url: "https://example.com",
        title: "Example",
        visitedAt: 1,
        source: "chrome-import",
        browserProfile: "Default",
      },
    ],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(importedHistory.length).toBe(1);
  expect(result).toEqual({
    ok: false,
    code: "CHROME_COOKIE_IMPORT_FAILED",
    importedCookies: 0,
    importedHistory: 1,
    message: "failed to copy locked cookie database",
  });
});

test("importBrowser rolls back cookies written during the current import attempt when a later write fails", async () => {
  const setCalls: Electron.CookiesSetDetails[] = [];
  const removeCalls: Array<{ url: string; name: string }> = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: {
            set: async (details: Electron.CookiesSetDetails) => {
              setCalls.push(details);
              if (details.name === "broken") {
                throw new Error("write failed");
              }
            },
            remove: async (url: string, name: string) => {
              removeCalls.push({ url, name });
            },
            flushStore: async () => undefined,
          },
        }) as never,
    },
    historyService: stubHistoryService(),
    loadChromiumHistoryImpl: async () => [],
    loadChromiumCookiesImpl: async () => [
      {
        host: ".example.com",
        path: "/",
        name: "ok",
        value: "1",
      },
      {
        host: ".example.com",
        path: "/",
        name: "broken",
        value: "2",
      },
    ],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(setCalls.length).toBe(2);
  expect(removeCalls).toEqual([
    {
      url: "http://example.com/",
      name: "ok",
    },
  ]);
  expect(result).toEqual({
    ok: false,
    code: "CHROME_COOKIE_IMPORT_FAILED",
    importedCookies: 0,
    importedHistory: 0,
    message: "write failed",
  });
});

test("importBrowser restores an overwritten cookie when a later write fails", async () => {
  const operations: string[] = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: {
            get: async (filter: { url?: string; name?: string }) => {
              if (filter.name === "session") {
                return [
                  {
                    name: "session",
                    value: "old-value",
                    domain: "example.com",
                    path: "/",
                    secure: false,
                    httpOnly: true,
                    session: false,
                    hostOnly: true,
                  },
                ] as Electron.Cookie[];
              }

              return [];
            },
            set: async (details: Electron.CookiesSetDetails) => {
              operations.push(`set:${details.name}:${details.value}`);
              if (details.name === "broken") {
                throw new Error("write failed");
              }
            },
            remove: async (url: string, name: string) => {
              operations.push(`remove:${name}:${url}`);
            },
            flushStore: async () => undefined,
          },
        }) as never,
    },
    historyService: stubHistoryService(),
    loadChromiumHistoryImpl: async () => [],
    loadChromiumCookiesImpl: async () => [
      {
        host: "example.com",
        path: "/",
        name: "session",
        value: "new-value",
        httpOnly: true,
      },
      {
        host: ".example.com",
        path: "/",
        name: "broken",
        value: "2",
      },
    ],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(operations).toEqual([
    "set:session:new-value",
    "set:broken:2",
    "remove:session:http://example.com/",
    "set:session:old-value",
  ]);
  expect(result).toEqual({
    ok: false,
    code: "CHROME_COOKIE_IMPORT_FAILED",
    importedCookies: 0,
    importedHistory: 0,
    message: "write failed",
  });
});

// ---------------------------------------------------------------------------
// Chromium cookie collection
// ---------------------------------------------------------------------------

test("collectChromiumCookies preserves host-only host_key values", () => {
  const cookies = collectChromiumCookies(
    [
      {
        name: "sid",
        value: "abc",
        host_key: "example.com",
        path: "/",
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
    ],
    {
      browser: "chrome",
      profile: "Default",
      includeExpired: false,
      decrypt: () => null,
    },
  );

  expect(cookies.length).toBe(1);
  const cookie = toElectronCookieInput(cookies[0]!);
  expect(cookie.url).toBe("http://example.com/");
  expect("domain" in cookie).toBe(false);
});

test("collectChromiumCookies keeps host-only and domain cookies distinct", () => {
  const cookies = collectChromiumCookies(
    [
      {
        name: "sid",
        value: "host-only",
        host_key: "example.com",
        path: "/",
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
      {
        name: "sid",
        value: "domain",
        host_key: ".example.com",
        path: "/",
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
    ],
    {
      browser: "chrome",
      profile: "Default",
      includeExpired: false,
      decrypt: () => null,
    },
  );

  expect(cookies.length).toBe(2);

  const mapped = cookies.map((value) => toElectronCookieInput(value));
  expect(mapped.filter((cookie) => "domain" in cookie).length).toBe(1);
  expect(mapped.filter((cookie) => !("domain" in cookie)).length).toBe(1);
});

// ---------------------------------------------------------------------------
// Firefox / Zen cookie collection
// ---------------------------------------------------------------------------

test("collectFirefoxCookies parses moz_cookies rows correctly", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "sid",
        value: "abc",
        host: ".example.com",
        path: "/",
        expiry: "1798761600000",
        isSecure: 1,
        isHttpOnly: 1,
        sameSite: 1,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  const cookie = cookies[0]!;
  expect(cookie.name).toBe("sid");
  expect(cookie.value).toBe("abc");
  expect(cookie.secure).toBe(true);
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  // Expiry should be in seconds (1798761600000 ms -> 1798761600 s)
  expect(cookie.expires).toBe(1798761600);
});

test("collectFirefoxCookies preserves host-only cookies", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "sid",
        value: "abc",
        host: "example.com",
        path: "/",
        expiry: 0,
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 0,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  const mapped = toElectronCookieInput(cookies[0]!);
  expect(mapped.url).toBe("http://example.com/");
  expect("domain" in mapped).toBe(false);
});

test("collectFirefoxCookies handles standard Firefox seconds-based expiry", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "sid",
        value: "abc",
        host: ".example.com",
        path: "/",
        expiry: "1798761600",
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 0,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  expect(cookies[0]?.expires).toBe(1798761600);
});

// ---------------------------------------------------------------------------
// Zen import
// ---------------------------------------------------------------------------

test("importBrowser supports Zen history-only imports", async () => {
  const importedHistory: unknown[] = [];

  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(importedHistory),
    loadZenHistoryImpl: async () => [
      {
        url: "https://zen-browser.app",
        title: "Zen",
        visitedAt: 1758092452631,
        source: "zen-import",
        browserProfile: "test",
      },
    ],
    loadZenCookiesImpl: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await service.importBrowser("zen", "/tmp/zen-profile", "history");

  expect(result).toEqual({ ok: true, importedCookies: 0, importedHistory: 1 });
  expect(importedHistory.length).toBe(1);
});

test("importBrowser supports Zen cookies-only imports", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    loadZenCookiesImpl: async () => [
      { host: ".example.com", path: "/", name: "sid", value: "abc" },
    ],
    loadZenHistoryImpl: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await service.importBrowser("zen", "/tmp/zen-profile", "cookies");

  expect(result).toEqual({ ok: true, importedCookies: 1, importedHistory: 0 });
});

// ---------------------------------------------------------------------------
// Clear browsing data
// ---------------------------------------------------------------------------

test("clearBrowsingData clears history when target is history", async () => {
  let historyClearCalled = false;

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: { set: async () => undefined, flushStore: async () => undefined },
          clearStorageData: async () => undefined,
          clearCache: async () => undefined,
        }) as never,
    },
    historyService: {
      importEntries: () => 0,
      clearAll: () => {
        historyClearCalled = true;
      },
    },
  });

  const result = await service.clearBrowsingData("history");

  expect(result.ok).toBe(true);
  expect(historyClearCalled).toBe(true);
});

test("clearBrowsingData returns error on session failure", async () => {
  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: { set: async () => undefined, flushStore: async () => undefined },
          clearStorageData: async () => {
            throw new Error("session error");
          },
          clearCache: async () => undefined,
        }) as never,
    },
    historyService: stubHistoryService(),
  });

  const result = await service.clearBrowsingData("cookies");

  expect(result.ok).toBe(false);
  expect(result.error).toBe("session error");
});

// ---------------------------------------------------------------------------
// Rollback tests (host-only / domain variants)
// ---------------------------------------------------------------------------

test("importBrowser restores the matching host-only cookie variant on rollback", async () => {
  const operations: string[] = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: {
            get: async () =>
              [
                {
                  name: "session",
                  value: "old-host-only",
                  domain: "example.com",
                  path: "/",
                  secure: false,
                  httpOnly: true,
                  session: false,
                  hostOnly: true,
                },
                {
                  name: "session",
                  value: "old-domain",
                  domain: "example.com",
                  path: "/",
                  secure: false,
                  httpOnly: true,
                  session: false,
                  hostOnly: false,
                },
              ] as Electron.Cookie[],
            set: async (details: Electron.CookiesSetDetails) => {
              operations.push(
                `set:${details.name}:${details.value}:${"domain" in details ? "domain" : "host"}`,
              );
              if (details.name === "broken") {
                throw new Error("write failed");
              }
            },
            remove: async (url: string, name: string) => {
              operations.push(`remove:${name}:${url}`);
            },
            flushStore: async () => undefined,
          },
        }) as never,
    },
    historyService: stubHistoryService(),
    loadChromiumHistoryImpl: async () => [],
    loadChromiumCookiesImpl: async () => [
      {
        host: "example.com",
        path: "/",
        name: "session",
        value: "new-host-only",
        httpOnly: true,
      },
      {
        host: ".example.com",
        path: "/",
        name: "broken",
        value: "2",
      },
    ],
  });

  const result = await service.importBrowser("chrome", "/tmp/Default");

  expect(operations).toEqual([
    "set:session:new-host-only:host",
    "set:broken:2:domain",
    "remove:session:http://example.com/",
    "set:session:old-host-only:host",
  ]);
  expect(result.ok).toBe(false);
});

// ---------------------------------------------------------------------------
// Safari binary cookie parser
// ---------------------------------------------------------------------------

test("decodeSafariBinaryCookies preserves host-only cookies without widening them", () => {
  const cookieBuffer = Buffer.alloc(128);
  cookieBuffer.writeUInt32LE(128, 0);
  cookieBuffer.writeUInt32LE(0, 4);
  cookieBuffer.writeUInt32LE(0, 8);
  cookieBuffer.writeUInt32LE(48, 12);
  cookieBuffer.writeUInt32LE(64, 16);
  cookieBuffer.writeUInt32LE(76, 20);
  cookieBuffer.writeUInt32LE(80, 24);
  cookieBuffer.writeUInt32LE(82, 28);
  cookieBuffer.writeDoubleLE(0, 40);
  cookieBuffer.write("example.com\0", 64, "utf8");
  cookieBuffer.write("sid\0", 76, "utf8");
  cookieBuffer.write("/\0", 80, "utf8");
  cookieBuffer.write("abc\0", 82, "utf8");

  const page = Buffer.alloc(8 + 4 + 128);
  page.writeUInt32BE(0x00000100, 0);
  page.writeUInt32LE(1, 4);
  page.writeUInt32LE(12, 8);
  cookieBuffer.copy(page, 12);

  const file = Buffer.alloc(8 + 4 + page.length);
  file.write("cook", 0, "utf8");
  file.writeUInt32BE(1, 4);
  file.writeUInt32BE(page.length, 8);
  page.copy(file, 12);

  const cookies = decodeSafariBinaryCookies(file);

  expect(cookies.length).toBe(1);
  const cookie = toElectronCookieInput(cookies[0]!);
  expect(cookie.url).toBe("http://example.com/");
  expect("domain" in cookie).toBe(false);
});

test("decodeSafariBinaryCookies keeps distinct host-only cookies for different hosts", () => {
  const firstCookie = makeCookie("a.example.com", "sid", "one");
  const secondCookie = makeCookie("b.example.com", "sid", "two");

  const firstOffset = 16;
  const secondOffset = firstOffset + firstCookie.length;
  const pageLength = secondOffset + secondCookie.length;
  const page = Buffer.alloc(pageLength);
  page.writeUInt32BE(0x00000100, 0);
  page.writeUInt32LE(2, 4);
  page.writeUInt32LE(firstOffset, 8);
  page.writeUInt32LE(secondOffset, 12);
  firstCookie.copy(page, firstOffset);
  secondCookie.copy(page, secondOffset);

  const file = Buffer.alloc(8 + 4 + page.length);
  file.write("cook", 0, "utf8");
  file.writeUInt32BE(1, 4);
  file.writeUInt32BE(page.length, 8);
  page.copy(file, 12);

  const cookies = decodeSafariBinaryCookies(file);

  expect(cookies.length).toBe(2);
  const urls = cookies.map((cookie) => toElectronCookieInput(cookie).url).toSorted();
  expect(urls).toEqual(["http://a.example.com/", "http://b.example.com/"]);
});

test("decodeSafariBinaryCookies keeps host-only and domain cookies distinct for the same hostname", () => {
  const firstCookie = makeCookie("example.com", "sid", "host-only");
  const secondCookie = makeCookie(".example.com", "sid", "domain");

  const firstOffset = 16;
  const secondOffset = firstOffset + firstCookie.length;
  const pageLength = secondOffset + secondCookie.length;
  const page = Buffer.alloc(pageLength);
  page.writeUInt32BE(0x00000100, 0);
  page.writeUInt32LE(2, 4);
  page.writeUInt32LE(firstOffset, 8);
  page.writeUInt32LE(secondOffset, 12);
  firstCookie.copy(page, firstOffset);
  secondCookie.copy(page, secondOffset);

  const file = Buffer.alloc(8 + 4 + page.length);
  file.write("cook", 0, "utf8");
  file.writeUInt32BE(1, 4);
  file.writeUInt32BE(page.length, 8);
  page.copy(file, 12);

  const cookies = decodeSafariBinaryCookies(file);

  expect(cookies.length).toBe(2);
  const mapped = cookies.map((cookie) => toElectronCookieInput(cookie));
  expect(mapped.filter((cookie) => "domain" in cookie).length).toBe(1);
  expect(mapped.filter((cookie) => !("domain" in cookie)).length).toBe(1);
});

// ---------------------------------------------------------------------------
// listProfiles edge cases
// ---------------------------------------------------------------------------

test("listProfiles returns empty array for Safari (no profiles)", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
  });

  const profiles = await service.listProfiles("safari");

  expect(profiles).toEqual([]);
});

test("listProfiles skips Zen profiles without importable data files", async () => {
  const zenDir = mkdtempSync(join(tmpdir(), "devspace-zen-skip-"));

  try {
    // Profile with data
    mkdirSync(join(zenDir, "Profiles", "abc.withdata"), { recursive: true });
    writeFileSync(join(zenDir, "Profiles", "abc.withdata", "places.sqlite"), "");

    // Profile without data files
    mkdirSync(join(zenDir, "Profiles", "xyz.empty"), { recursive: true });
    writeFileSync(join(zenDir, "Profiles", "xyz.empty", "prefs.js"), "");

    writeFileSync(
      join(zenDir, "profiles.ini"),
      [
        "[Profile0]",
        "Name=With Data",
        "IsRelative=1",
        "Path=Profiles/abc.withdata",
        "",
        "[Profile1]",
        "Name=Empty",
        "IsRelative=1",
        "Path=Profiles/xyz.empty",
      ].join("\n"),
      "utf8",
    );

    const service = new BrowserImportService({
      zenRoot: zenDir,
      sessionManager: stubSession(),
      historyService: stubHistoryService(),
    });

    const profiles = await service.listProfiles("zen");

    expect(profiles.length).toBe(1);
    expect(profiles[0]?.name).toBe("With Data");
  } finally {
    rmSync(zenDir, { recursive: true, force: true });
  }
});

test("listProfiles returns empty array when Zen root does not exist", async () => {
  const service = new BrowserImportService({
    zenRoot: "/tmp/nonexistent-zen-root",
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
  });

  const profiles = await service.listProfiles("zen");

  expect(profiles).toEqual([]);
});

test("listProfiles returns empty array when Chrome root does not exist", async () => {
  const service = new BrowserImportService({
    chromiumRoots: { chrome: "/tmp/nonexistent-chrome-root" },
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
  });

  const profiles = await service.listProfiles("chrome");

  expect(profiles).toEqual([]);
});

// ---------------------------------------------------------------------------
// detectAccess
// ---------------------------------------------------------------------------

test("detectAccess returns ok for non-Safari browsers", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
  });

  expect(await service.detectAccess("chrome")).toEqual({ ok: true });
  expect(await service.detectAccess("arc")).toEqual({ ok: true });
  expect(await service.detectAccess("zen")).toEqual({ ok: true });
});

// ---------------------------------------------------------------------------
// importBrowser edge cases
// ---------------------------------------------------------------------------

test("importBrowser returns error for unsupported browser source", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
  });

  // Cast to bypass TypeScript's narrowing
  const result = await service.importBrowser("firefox" as "chrome", null);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe("UNSUPPORTED_BROWSER");
  }
});

test("importBrowser uses ARC_ error prefix for Arc import failures", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    loadChromiumHistoryImpl: async () => {
      throw new Error("arc history failed");
    },
    loadChromiumCookiesImpl: async () => [],
  });

  const result = await service.importBrowser("arc", "/tmp/arc-profile");

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe("ARC_IMPORT_FAILED");
  }
});

test("importBrowser uses ZEN_ error prefix for Zen import failures", async () => {
  const service = new BrowserImportService({
    sessionManager: stubSession(),
    historyService: stubHistoryService(),
    loadZenHistoryImpl: async () => {
      throw new Error("zen history failed");
    },
    loadZenCookiesImpl: async () => [],
  });

  const result = await service.importBrowser("zen", "/tmp/zen-profile");

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe("ZEN_IMPORT_FAILED");
  }
});

test("importBrowser wraps Zen cookie write failures with ZEN_COOKIE_IMPORT_FAILED code", async () => {
  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: {
            set: async () => {
              throw new Error("write failed");
            },
            flushStore: async () => undefined,
          },
        }) as never,
    },
    historyService: stubHistoryService(),
    loadZenHistoryImpl: async () => [],
    loadZenCookiesImpl: async () => [
      { host: ".example.com", path: "/", name: "sid", value: "abc" },
    ],
  });

  const result = await service.importBrowser("zen", "/tmp/zen-profile", "cookies");

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe("ZEN_COOKIE_IMPORT_FAILED");
  }
});

// ---------------------------------------------------------------------------
// clearBrowsingData
// ---------------------------------------------------------------------------

test("clearBrowsingData everything calls all session clearing methods and history clearAll", async () => {
  const calls: string[] = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: { set: async () => undefined, flushStore: async () => undefined },
          clearStorageData: async (opts?: { storages?: string[] }) => {
            calls.push(`clearStorageData:${opts?.storages?.join(",") ?? "all"}`);
          },
          clearCache: async () => {
            calls.push("clearCache");
          },
        }) as never,
    },
    historyService: {
      importEntries: () => 0,
      clearAll: () => {
        calls.push("clearAll");
      },
    },
  });

  const result = await service.clearBrowsingData("everything");

  expect(result.ok).toBe(true);
  expect(calls).toContain("clearAll");
  expect(calls).toContain("clearCache");
  // Should clear cookies, cache storages, and other storage
  expect(calls.some((c) => c.includes("cookies"))).toBe(true);
  expect(calls.some((c) => c.includes("localstorage"))).toBe(true);
});

test("clearBrowsingData cache only calls clearCache without touching cookies or history", async () => {
  const calls: string[] = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: { set: async () => undefined, flushStore: async () => undefined },
          clearStorageData: async (opts?: { storages?: string[] }) => {
            calls.push(`clearStorageData:${opts?.storages?.join(",") ?? "all"}`);
          },
          clearCache: async () => {
            calls.push("clearCache");
          },
        }) as never,
    },
    historyService: {
      importEntries: () => 0,
      clearAll: () => {
        calls.push("clearAll");
      },
    },
  });

  const result = await service.clearBrowsingData("cache");

  expect(result.ok).toBe(true);
  expect(calls).toContain("clearCache");
  expect(calls).not.toContain("clearAll");
  expect(calls.every((c) => !c.includes("cookies"))).toBe(true);
});

test("clearBrowsingData cookies only clears cookies without touching history or cache", async () => {
  const calls: string[] = [];

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () =>
        ({
          cookies: { set: async () => undefined, flushStore: async () => undefined },
          clearStorageData: async (opts?: { storages?: string[] }) => {
            calls.push(`clearStorageData:${opts?.storages?.join(",") ?? "all"}`);
          },
          clearCache: async () => {
            calls.push("clearCache");
          },
        }) as never,
    },
    historyService: {
      importEntries: () => 0,
      clearAll: () => {
        calls.push("clearAll");
      },
    },
  });

  const result = await service.clearBrowsingData("cookies");

  expect(result.ok).toBe(true);
  expect(calls).toEqual(["clearStorageData:cookies"]);
});

// ---------------------------------------------------------------------------
// collectFirefoxCookies edge cases
// ---------------------------------------------------------------------------

test("collectFirefoxCookies filters expired cookies", () => {
  const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

  const cookies = collectFirefoxCookies(
    [
      {
        name: "expired",
        value: "old",
        host: ".example.com",
        path: "/",
        expiry: String(pastExpiry),
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 0,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(0);
});

test("collectFirefoxCookies deduplicates by name/domain/path/variant", () => {
  const futureExpiry = Math.floor(Date.now() / 1000) + 86400;

  const cookies = collectFirefoxCookies(
    [
      {
        name: "sid",
        value: "first",
        host: ".example.com",
        path: "/",
        expiry: String(futureExpiry),
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 0,
      },
      {
        name: "sid",
        value: "duplicate",
        host: ".example.com",
        path: "/",
        expiry: String(futureExpiry),
        isSecure: 1,
        isHttpOnly: 0,
        sameSite: 0,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  expect(cookies[0]?.value).toBe("first");
});

test("collectFirefoxCookies includes cookies without expiry (session cookies)", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "session",
        value: "abc",
        host: ".example.com",
        path: "/",
        expiry: 0,
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 0,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  expect(cookies[0]?.name).toBe("session");
});

test("collectFirefoxCookies maps sameSite=2 to Strict", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "strict",
        value: "abc",
        host: ".example.com",
        path: "/",
        expiry: 0,
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 2,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  expect(cookies[0]?.sameSite).toBe("Strict");
});

test("collectFirefoxCookies treats unrecognized sameSite values as undefined", () => {
  const cookies = collectFirefoxCookies(
    [
      {
        name: "unknown",
        value: "abc",
        host: ".example.com",
        path: "/",
        expiry: 0,
        isSecure: 0,
        isHttpOnly: 0,
        sameSite: 256,
      },
    ],
    "test-profile",
  );

  expect(cookies.length).toBe(1);
  expect(cookies[0]?.sameSite).toBeUndefined();
});

// ---------------------------------------------------------------------------
// parseProfilesIni edge cases
// ---------------------------------------------------------------------------

test("parseProfilesIni skips profile sections missing Name", () => {
  const ini = `
[Profile0]
IsRelative=1
Path=Profiles/abc.default
`;
  const profiles = parseProfilesIni(ini);

  expect(profiles).toEqual([]);
});

test("parseProfilesIni skips profile sections missing Path", () => {
  const ini = `
[Profile0]
Name=Default
IsRelative=1
`;
  const profiles = parseProfilesIni(ini);

  expect(profiles).toEqual([]);
});

test("parseProfilesIni handles Windows-style line endings", () => {
  const ini = "[Profile0]\r\nName=Default\r\nIsRelative=1\r\nPath=Profiles/abc.default\r\n";
  const profiles = parseProfilesIni(ini);

  expect(profiles).toEqual([{ name: "Default", path: "Profiles/abc.default", isRelative: true }]);
});

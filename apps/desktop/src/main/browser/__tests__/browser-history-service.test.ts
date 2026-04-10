import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserHistoryService } from "../browser-history-service";

// Silence intentional error-path logging (ENOENT, corrupt JSON, etc.)
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("dedupes imported history by source/profile/url/visitedAt", () => {
  const service = new BrowserHistoryService();
  service.importEntries([
    {
      id: "1",
      url: "https://example.com",
      title: "Example",
      visitedAt: 1,
      source: "chrome-import",
      browserProfile: "Default",
    },
    {
      id: "2",
      url: "https://example.com",
      title: "Example",
      visitedAt: 1,
      source: "chrome-import",
      browserProfile: "Default",
    },
  ]);

  expect(service.getEntries().length).toBe(1);
});

test("persists visits and reloads stored history on startup", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const service = new BrowserHistoryService({ appDataPath });
    service.recordVisit({
      url: "https://devspace.example.com",
      title: "DevSpace",
      visitedAt: 123,
      source: "devspace",
    });

    const storedJson = readFileSync(join(appDataPath, "browser-history.json"), "utf8");
    const storedEntries = JSON.parse(storedJson) as Array<{ url: string }>;
    expect(storedEntries.length).toBe(1);
    expect(storedEntries[0]?.url).toBe("https://devspace.example.com");

    const reloadedService = new BrowserHistoryService({ appDataPath });
    expect(reloadedService.getEntries().length).toBe(1);
    expect(reloadedService.getEntries()[0]?.title).toBe("DevSpace");
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("missing history files are treated as empty state without warnings", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const warnSpy = vi.spyOn(console, "warn");
    const service = new BrowserHistoryService({ appDataPath });

    expect(service.getEntries()).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("first persisted visit does not warn when no backup exists yet", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const warnSpy = vi.spyOn(console, "warn");
    const service = new BrowserHistoryService({ appDataPath });

    service.recordVisit({
      url: "https://devspace.example.com",
      title: "Devspace",
      visitedAt: 123,
      source: "devspace",
    });

    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("keeps last good history when storage is interrupted or corrupted on startup", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const service = new BrowserHistoryService({ appDataPath });
    service.recordVisit({
      url: "https://devspace.example.com",
      title: "DevSpace",
      visitedAt: 123,
      source: "devspace",
    });

    writeFileSync(join(appDataPath, "browser-history.json"), '{"broken":', "utf8");

    const reloadedService = new BrowserHistoryService({ appDataPath });

    expect(reloadedService.getEntries().length).toBe(1);
    expect(reloadedService.getEntries()[0]?.title).toBe("DevSpace");
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("failed recovery attempt does not destroy the last good backup before a later retry", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const service = new BrowserHistoryService({ appDataPath });
    service.recordVisit({
      url: "https://devspace.example.com",
      title: "DevSpace",
      visitedAt: 123,
      source: "devspace",
    });

    const backupPath = join(appDataPath, "browser-history.json.bak");
    const primaryPath = join(appDataPath, "browser-history.json");
    const tempPath = join(appDataPath, "browser-history.json.tmp");
    const originalBackup = readFileSync(backupPath, "utf8");

    writeFileSync(primaryPath, '{"broken":', "utf8");
    mkdirSync(tempPath);

    expect(() => new BrowserHistoryService({ appDataPath })).toThrow();

    expect(readFileSync(backupPath, "utf8")).toBe(originalBackup);

    rmSync(tempPath, { recursive: true, force: true });
    const recoveredService = new BrowserHistoryService({ appDataPath });

    expect(recoveredService.getEntries().length).toBe(1);
    expect(readFileSync(backupPath, "utf8")).toBe(originalBackup);
    expect(readFileSync(primaryPath, "utf8")).toBe(originalBackup);
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("clearAll removes all entries and deletes backup file", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const service = new BrowserHistoryService({ appDataPath });
    service.recordVisit({
      url: "https://example.com",
      title: "Example",
      visitedAt: 1,
      source: "devspace",
    });

    expect(service.getEntries().length).toBe(1);

    const backupPath = join(appDataPath, "browser-history.json.bak");
    expect(readFileSync(backupPath, "utf8")).toContain("example.com");

    service.clearAll();

    expect(service.getEntries().length).toBe(0);

    // Primary file should be empty array
    const stored = JSON.parse(readFileSync(join(appDataPath, "browser-history.json"), "utf8"));
    expect(stored).toEqual([]);

    // Backup should be removed
    expect(() => readFileSync(backupPath, "utf8")).toThrow();
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("clearAll persists empty state and reload returns empty", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-"));

  try {
    const service = new BrowserHistoryService({ appDataPath });
    service.importEntries([
      { url: "https://a.com", title: "A", visitedAt: 1, source: "test" },
      { url: "https://b.com", title: "B", visitedAt: 2, source: "test" },
    ]);

    service.clearAll();

    const reloaded = new BrowserHistoryService({ appDataPath });
    expect(reloaded.getEntries().length).toBe(0);
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

test("importEntries enforces maximum history entry cap", () => {
  const service = new BrowserHistoryService();

  // Generate entries exceeding the cap (10,000)
  const entries = Array.from({ length: 10_050 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: `Page ${i}`,
    visitedAt: i,
    source: "test",
  }));

  service.importEntries(entries);

  expect(service.getEntries().length).toBe(10_000);
  // Most recent entries should be kept (sorted desc by visitedAt)
  expect(service.getEntries()[0]?.visitedAt).toBe(10_049);
});

test("cap is applied retroactively when loading oversized history from disk", () => {
  const appDataPath = mkdtempSync(join(tmpdir(), "devspace-history-cap-"));

  try {
    // Write an oversized history file directly to disk
    const entries = Array.from({ length: 10_050 }, (_, i) => ({
      id: `id-${i}`,
      url: `https://example.com/${i}`,
      title: `Page ${i}`,
      visitedAt: 10_050 - i,
      source: "test",
    }));

    mkdirSync(appDataPath, { recursive: true });
    writeFileSync(join(appDataPath, "browser-history.json"), JSON.stringify(entries), "utf8");

    const service = new BrowserHistoryService({ appDataPath });

    expect(service.getEntries().length).toBe(10_000);
  } finally {
    rmSync(appDataPath, { recursive: true, force: true });
  }
});

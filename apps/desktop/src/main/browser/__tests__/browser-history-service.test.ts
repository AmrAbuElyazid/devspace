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

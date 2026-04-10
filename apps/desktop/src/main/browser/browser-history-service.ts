import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_HISTORY_ENTRIES = 10_000;

export interface BrowserHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  source: string;
  browserProfile?: string;
}

export type BrowserHistoryEntryInput = Omit<BrowserHistoryEntry, "id"> & {
  id?: string;
};

export interface BrowserHistoryRecorder {
  recordVisit(entry: BrowserHistoryEntryInput): void;
  importEntries(entries: BrowserHistoryEntryInput[]): void;
  clearAll(): void;
}

type BrowserHistoryServiceOptions = {
  appDataPath?: string;
};

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function toDedupeKey(
  entry: Pick<BrowserHistoryEntryInput, "source" | "browserProfile" | "url" | "visitedAt">,
): string {
  return [entry.source, entry.browserProfile ?? "", entry.url, String(entry.visitedAt)].join("::");
}

function normalizeEntry(entry: BrowserHistoryEntryInput): BrowserHistoryEntry {
  return {
    id: entry.id ?? randomUUID(),
    url: entry.url,
    title: entry.title,
    visitedAt: entry.visitedAt,
    source: entry.source,
    ...(entry.browserProfile ? { browserProfile: entry.browserProfile } : {}),
  };
}

function dedupeEntries(entries: BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  const seen = new Set<string>();
  const deduped: BrowserHistoryEntry[] = [];

  for (const entry of entries) {
    const key = toDedupeKey(entry);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped.toSorted((left, right) => right.visitedAt - left.visitedAt);
}

function capEntries(entries: BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  return entries.length > MAX_HISTORY_ENTRIES ? entries.slice(0, MAX_HISTORY_ENTRIES) : entries;
}

export class BrowserHistoryService implements BrowserHistoryRecorder {
  private readonly storagePath: string | null;
  private readonly backupStoragePath: string | null;

  private entries: BrowserHistoryEntry[];

  constructor(options: BrowserHistoryServiceOptions = {}) {
    this.storagePath = options.appDataPath
      ? join(options.appDataPath, "browser-history.json")
      : null;
    this.backupStoragePath = this.storagePath ? `${this.storagePath}.bak` : null;
    this.entries = this.loadEntries();
  }

  recordVisit(entry: BrowserHistoryEntryInput): void {
    this.entries = capEntries(dedupeEntries([normalizeEntry(entry), ...this.entries]));
    this.persistEntries();
  }

  importEntries(entries: BrowserHistoryEntryInput[]): void {
    const normalizedEntries = entries.map(normalizeEntry);
    this.entries = capEntries(dedupeEntries([...this.entries, ...normalizedEntries]));
    this.persistEntries();
  }

  clearAll(): void {
    this.entries = [];
    this.persistEntries();

    if (this.backupStoragePath) {
      try {
        rmSync(this.backupStoragePath, { force: true });
      } catch (err) {
        console.warn("[browser-history] Backup removal failed:", err);
      }
    }
  }

  getEntries(): BrowserHistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  private loadEntries(): BrowserHistoryEntry[] {
    if (!this.storagePath) {
      return [];
    }

    const primaryEntries = this.readEntriesFromPath(this.storagePath);
    if (primaryEntries) {
      return capEntries(primaryEntries);
    }

    const backupEntries = this.backupStoragePath
      ? this.readEntriesFromPath(this.backupStoragePath)
      : null;
    if (backupEntries) {
      const capped = capEntries(backupEntries);
      this.repairPrimaryFromBackup(capped);
      return capped;
    }

    return [];
  }

  private readEntriesFromPath(filePath: string): BrowserHistoryEntry[] | null {
    try {
      const stored = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(stored) as BrowserHistoryEntryInput[];
      if (!Array.isArray(parsed)) {
        return null;
      }

      return dedupeEntries(parsed.map(normalizeEntry));
    } catch (err) {
      if (!isMissingFileError(err)) {
        console.warn("[browser-history] Reading history entries failed:", err);
      }
      return null;
    }
  }

  private persistEntries(): void {
    this.persistSnapshot(this.entries);
  }

  private repairPrimaryFromBackup(entries: BrowserHistoryEntry[]): void {
    if (!this.storagePath) {
      return;
    }

    mkdirSync(dirname(this.storagePath), { recursive: true });
    const nextContents = JSON.stringify(entries, null, 2);
    const tempPath = `${this.storagePath}.tmp`;

    writeFileSync(tempPath, nextContents, "utf8");
    renameSync(tempPath, this.storagePath);
  }

  private persistSnapshot(entries: BrowserHistoryEntry[]): void {
    if (!this.storagePath) {
      return;
    }

    mkdirSync(dirname(this.storagePath), { recursive: true });
    const nextContents = JSON.stringify(entries, null, 2);
    const tempPath = `${this.storagePath}.tmp`;

    if (this.backupStoragePath && existsSync(this.storagePath)) {
      try {
        copyFileSync(this.storagePath, this.backupStoragePath);
      } catch (err) {
        console.warn("[browser-history] Backup copy failed (primary may not exist yet):", err);
      }
    }

    writeFileSync(tempPath, nextContents, "utf8");
    renameSync(tempPath, this.storagePath);

    if (this.backupStoragePath) {
      copyFileSync(this.storagePath, this.backupStoragePath);
    }
  }
}

import type { BrowserHistoryEntryInput } from "./browser-history-service";

export type ImportedHistoryEntry = Omit<BrowserHistoryEntryInput, "id">;

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

export function mapHistoryRows(
  rows: Array<Record<string, unknown>>,
  options: {
    source: string;
    browserProfile?: string;
    toVisitedAt: (value: unknown) => number;
  },
): ImportedHistoryEntry[] {
  const entries: ImportedHistoryEntry[] = [];

  for (const row of rows) {
    const url = asString(row.url);
    const visitedAt = options.toVisitedAt(row.visited_at);
    if (!url || !Number.isFinite(visitedAt)) {
      continue;
    }

    entries.push({
      url,
      title: asString(row.title) ?? url,
      visitedAt,
      source: options.source,
      ...(options.browserProfile ? { browserProfile: options.browserProfile } : {}),
    });
  }

  return entries;
}

export function chromeTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric / 1000 - 11_644_473_600_000);
}

export function safariTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null) {
    return 0;
  }

  return Math.round((numeric + 978_307_200) * 1000);
}

export function firefoxTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric / 1000);
}

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

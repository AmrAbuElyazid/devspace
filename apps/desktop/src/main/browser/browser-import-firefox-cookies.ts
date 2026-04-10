import type { BrowserName, Cookie as SweetCookie } from "@steipete/sweet-cookie";

type FirefoxImportedBrowserCookie = SweetCookie & {
  source: { browser: BrowserName; profile?: string };
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export function collectFirefoxCookies(
  rows: Array<Record<string, unknown>>,
  profile: string,
): FirefoxImportedBrowserCookie[] {
  const cookies: FirefoxImportedBrowserCookie[] = [];
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

function normalizeFirefoxExpiryToSeconds(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) {
    return undefined;
  }

  if (numeric > 1_000_000_000_000) {
    return Math.round(numeric / 1000);
  }

  return Math.round(numeric);
}

function isTruthyDbFlag(value: unknown): boolean {
  return value === 1 || value === 1n || value === "1" || value === true;
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

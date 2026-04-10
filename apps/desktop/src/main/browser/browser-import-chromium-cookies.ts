import { createDecipheriv } from "node:crypto";
import type { BrowserName, Cookie as SweetCookie } from "@steipete/sweet-cookie";

type ChromiumImportedBrowserCookie = SweetCookie & {
  source: { browser: BrowserName; profile?: string };
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export function collectChromiumCookies(
  rows: Array<Record<string, unknown>>,
  options: {
    browser: string;
    profile: string;
    includeExpired: boolean;
    decrypt: (encryptedValue: Uint8Array) => string | null;
  },
): ChromiumImportedBrowserCookie[] {
  const cookies: ChromiumImportedBrowserCookie[] = [];
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

export function decryptChromiumCookieValue(
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

import type { BrowserName, Cookie as SweetCookie } from "@steipete/sweet-cookie";

type SafariImportedBrowserCookie = SweetCookie & {
  source: { browser: BrowserName; profile?: string };
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export function decodeSafariBinaryCookies(buffer: Buffer): SafariImportedBrowserCookie[] {
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

  const cookies: SafariImportedBrowserCookie[] = [];
  for (const pageSize of pageSizes) {
    const page = buffer.subarray(cursor, cursor + pageSize);
    cursor += pageSize;
    cookies.push(...decodeSafariCookiePage(page));
  }

  return dedupeCookies(cookies);
}

function decodeSafariCookiePage(page: Buffer): SafariImportedBrowserCookie[] {
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
    .filter((cookie): cookie is SafariImportedBrowserCookie => Boolean(cookie));
}

function decodeSafariCookie(cookieBuffer: Buffer): SafariImportedBrowserCookie | null {
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
    const cleaned = raw.trim();
    if (!cleaned) {
      return undefined;
    }

    return cleaned.startsWith(".") ? cleaned.slice(1) : cleaned;
  }
}

function dedupeCookies(cookies: SafariImportedBrowserCookie[]): SafariImportedBrowserCookie[] {
  const merged = new Map<string, SafariImportedBrowserCookie>();
  for (const cookie of cookies) {
    const variant = cookie.hostOnly ? "host" : "domain";
    const key = `${cookie.name}|${cookie.domain ?? cookie.host ?? ""}|${cookie.path ?? ""}|${variant}`;
    if (!merged.has(key)) {
      merged.set(key, cookie);
    }
  }

  return Array.from(merged.values());
}

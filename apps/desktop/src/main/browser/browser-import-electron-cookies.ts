import type { Cookie as SweetCookie } from "@steipete/sweet-cookie";

type ElectronCookieSameSite = Electron.CookiesSetDetails["sameSite"];

export type ImportedCookieInput = Electron.CookiesSetDetails & {
  hostOnly?: boolean;
};

export function toElectronCookieInput(
  cookie: SweetCookie & {
    host?: string;
    hostOnly?: boolean;
    expiresAt?: number | null;
  },
): ImportedCookieInput {
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

function toElectronSameSite(value: SweetCookie["sameSite"]): ElectronCookieSameSite {
  if (value === "Strict") {
    return "strict";
  }

  if (value === "Lax") {
    return "lax";
  }

  return "no_restriction";
}

type ImportedCookieStoreInput = Electron.CookiesSetDetails & {
  hostOnly?: boolean;
};

type ImportedCookieStoreSnapshot = Electron.CookiesSetDetails & {
  hostOnly?: boolean;
};

export type BrowserCookieStore = {
  get?: (filter: Electron.CookiesGetFilter) => Promise<Electron.Cookie[]>;
  set: (details: Electron.CookiesSetDetails) => Promise<void>;
  remove?: (url: string, name: string) => Promise<void>;
  flushStore: () => Promise<void>;
};

export async function snapshotExistingCookies(
  cookieStore: BrowserCookieStore,
  cookies: ImportedCookieStoreInput[],
): Promise<Map<string, ImportedCookieStoreSnapshot>> {
  const getCookies = cookieStore.get;
  if (typeof getCookies !== "function") {
    return new Map();
  }

  const snapshots = new Map<string, ImportedCookieStoreSnapshot>();

  for (const cookie of cookies) {
    const key = toCookieSnapshotKey(cookie);
    if (snapshots.has(key) || !cookie.url || !cookie.name) {
      continue;
    }

    try {
      const existing = await getCookies({ url: cookie.url, name: cookie.name });
      const expectedHostOnly = !("domain" in cookie);
      const matching = existing.find((candidate) => {
        const samePath = (candidate.path ?? "/") === (cookie.path ?? "/");
        const sameHostOnly = Boolean(candidate.hostOnly) === expectedHostOnly;
        const candidateSnapshot = fromElectronCookie(candidate);
        const sameUrl = candidateSnapshot.url === cookie.url;
        return samePath && sameHostOnly && sameUrl;
      });
      if (matching) {
        snapshots.set(key, fromElectronCookie(matching));
      }
    } catch (err) {
      console.warn("[browser-import] Cookie snapshot lookup failed:", err);
    }
  }

  return snapshots;
}

export async function rollbackImportedCookies(
  cookieStore: BrowserCookieStore,
  cookies: ImportedCookieStoreInput[],
  previousCookies: Map<string, ImportedCookieStoreSnapshot>,
): Promise<void> {
  const removeCookie = cookieStore.remove;
  const removedFamilies = new Set<string>();

  for (const cookie of cookies.toReversed()) {
    if (!cookie.url || !cookie.name) {
      continue;
    }

    const familyKey = `${cookie.name}|${cookie.url}`;
    if (typeof removeCookie === "function" && !removedFamilies.has(familyKey)) {
      removedFamilies.add(familyKey);
      try {
        await removeCookie(cookie.url, cookie.name);
      } catch (err) {
        console.warn("[browser-import] Cookie rollback removal failed:", err);
      }
    }

    const previous = previousCookies.get(toCookieSnapshotKey(cookie));
    if (!previous) {
      continue;
    }

    try {
      await cookieStore.set(previous);
    } catch (err) {
      console.warn("[browser-import] Cookie rollback restore failed:", err);
    }
  }

  if (cookies.length > 0) {
    try {
      await cookieStore.flushStore();
    } catch (err) {
      console.warn("[browser-import] Cookie store flush during rollback failed:", err);
    }
  }
}

function toCookieSnapshotKey(
  cookie: Pick<Electron.CookiesSetDetails, "url" | "name" | "path"> & { hostOnly?: boolean },
): string {
  return `${cookie.name}|${cookie.url ?? ""}|${cookie.path ?? "/"}|${cookie.hostOnly ? "host" : "domain"}`;
}

function fromElectronCookie(cookie: Electron.Cookie): ImportedCookieStoreSnapshot {
  const normalizedDomain = (cookie.domain ?? "").replace(/^\./, "");
  const protocol = cookie.secure ? "https" : "http";
  const path = cookie.path && cookie.path.startsWith("/") ? cookie.path : "/";
  const sameSite = cookie.sameSite
    ? (cookie.sameSite as Electron.CookiesSetDetails["sameSite"])
    : undefined;

  return {
    url: `${protocol}://${normalizedDomain || "localhost"}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: cookie.secure ?? false,
    httpOnly: cookie.httpOnly ?? false,
    ...(!cookie.hostOnly && normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(!cookie.session && typeof cookie.expirationDate === "number"
      ? { expirationDate: cookie.expirationDate }
      : {}),
    ...(sameSite ? { sameSite } : {}),
    ...(cookie.hostOnly ? { hostOnly: true } : {}),
  };
}

/**
 * Resolves a site's favicon URL into a `data:` URL the renderer can display.
 *
 * The renderer runs under a deliberately tight CSP — `img-src 'self' data:
 * blob:` — so it cannot load `https://…/favicon.ico` directly, and widening
 * that to `https:` would hand every page in the app permission to fetch
 * arbitrary remote images. Fetching here instead keeps the renderer unable to
 * reach the network on its own, and `data:` is already allowed.
 *
 * Fetches use Electron's `net` module on the default session, which honours
 * the app's proxy settings. It does not share the browser partition's HTTP
 * cache, so an icon the page just loaded is fetched once more here — cheap for
 * an asset this size, and it keeps the browsing session's cookies out of it.
 */

/** Favicons are small; anything larger is not one, and is not worth decoding. */
const MAX_FAVICON_BYTES = 256 * 1024;
/** Bounds the cache so a long session across many sites cannot grow it without limit. */
const MAX_CACHED_FAVICONS = 256;

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Resolved data URLs keyed by source URL. Failures are cached as `null` too —
 * a site with a broken favicon would otherwise be refetched on every tab
 * render for the life of the session.
 */
const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(url: string, dataUrl: string | null): string | null {
  // Insertion-ordered eviction: the oldest entry is the least recently added,
  // which for favicons tracks "site I have not looked at in longest".
  if (cache.size >= MAX_CACHED_FAVICONS) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, dataUrl);
  return dataUrl;
}

function isSupportedFaviconUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchFaviconDataUrl(url: string, fetchImpl: FetchLike): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    // A 200 that returns an HTML error page is the common failure mode for a
    // missing favicon, and would otherwise be encoded and handed to an <img>.
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FAVICON_BYTES) return null;

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    // Offline, aborted, DNS failure, malformed response — all just mean the
    // tab keeps its generic icon.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveFaviconDataUrl(url: unknown, fetchImpl?: FetchLike): Promise<string | null> {
  if (typeof url !== "string" || url.length === 0) {
    return Promise.resolve(null);
  }

  // Some sites hand Chromium an inline icon already. Nothing to fetch, and it
  // is directly renderable under the existing CSP.
  if (url.startsWith("data:image/")) {
    return Promise.resolve(url);
  }

  if (!isSupportedFaviconUrl(url)) {
    return Promise.resolve(null);
  }

  const cached = cache.get(url);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  // Several tabs on the same site resolve the same icon at once on startup;
  // share one request between them rather than racing.
  const pending = inFlight.get(url);
  if (pending) return pending;

  const resolver = (async () => {
    const fetcher =
      fetchImpl ??
      ((input, init) => (require("electron") as typeof import("electron")).net.fetch(input, init));
    const dataUrl = await fetchFaviconDataUrl(url, fetcher);
    return remember(url, dataUrl);
  })().finally(() => {
    inFlight.delete(url);
  });

  inFlight.set(url, resolver);
  return resolver;
}

export function resetFaviconCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

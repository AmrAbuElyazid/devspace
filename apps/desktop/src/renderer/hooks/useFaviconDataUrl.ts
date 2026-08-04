import { useEffect, useSyncExternalStore } from "react";

/**
 * Resolves a favicon URL to a renderable `data:` URL, once per app session.
 *
 * The fetch happens in the main process (see `browser-favicon-service`) because
 * the renderer's CSP forbids remote images. Results are shared across every tab
 * pointing at the same icon and cached for the session, so switching between
 * ten tabs on one site costs a single resolution.
 *
 * `null` means "resolved, and there is no usable icon" — the caller should fall
 * back to a generic glyph. `undefined` means "still resolving".
 */
const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function request(url: string): void {
  if (resolved.has(url) || pending.has(url)) return;

  const task = window.api.browser
    .resolveFavicon(url)
    .catch(() => null)
    .then((dataUrl) => {
      resolved.set(url, dataUrl);
      pending.delete(url);
      emit();
    });

  pending.set(url, task);
}

export function useFaviconDataUrl(url: string | undefined): string | null | undefined {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (url === undefined ? null : resolved.get(url)),
    () => null,
  );

  useEffect(() => {
    if (url !== undefined) request(url);
  }, [url]);

  return url === undefined ? null : snapshot;
}

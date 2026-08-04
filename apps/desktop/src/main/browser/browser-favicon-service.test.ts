import { beforeEach, expect, test, vi } from "vitest";

import { resetFaviconCacheForTests, resolveFaviconDataUrl } from "./browser-favicon-service";

function imageResponse(bytes: Uint8Array, contentType = "image/png"): Response {
  return {
    ok: true,
    headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  } as unknown as Response;
}

const PNG = new Uint8Array([137, 80, 78, 71]);

beforeEach(() => {
  resetFaviconCacheForTests();
});

test("fetches an icon and returns it as a data URL", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(PNG));

  const result = await resolveFaviconDataUrl("https://example.com/favicon.png", fetchImpl);

  expect(result).toBe(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("an inline data URL is passed through without a fetch", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(PNG));
  const inline = "data:image/svg+xml;base64,PHN2Zy8+";

  expect(await resolveFaviconDataUrl(inline, fetchImpl)).toBe(inline);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("results are cached, so repeat resolutions cost one fetch", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(PNG));

  await resolveFaviconDataUrl("https://example.com/a.png", fetchImpl);
  await resolveFaviconDataUrl("https://example.com/a.png", fetchImpl);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("concurrent resolutions of the same icon share one request", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(PNG));

  const [first, second] = await Promise.all([
    resolveFaviconDataUrl("https://example.com/b.png", fetchImpl),
    resolveFaviconDataUrl("https://example.com/b.png", fetchImpl),
  ]);

  expect(first).toBe(second);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("failures are cached too, so a broken icon is not refetched forever", async () => {
  const fetchImpl = vi.fn(async () => ({ ok: false, headers: { get: () => null } }) as never);

  expect(await resolveFaviconDataUrl("https://example.com/404.png", fetchImpl)).toBeNull();
  expect(await resolveFaviconDataUrl("https://example.com/404.png", fetchImpl)).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a non-image response is rejected", async () => {
  // The usual shape of a missing favicon: a 200 that serves an HTML error page.
  const fetchImpl = vi.fn(async () => imageResponse(PNG, "text/html"));

  expect(await resolveFaviconDataUrl("https://example.com/missing", fetchImpl)).toBeNull();
});

test("an oversized response is rejected", async () => {
  const huge = new Uint8Array(256 * 1024 + 1);
  const fetchImpl = vi.fn(async () => imageResponse(huge));

  expect(await resolveFaviconDataUrl("https://example.com/huge.png", fetchImpl)).toBeNull();
});

test("an empty response is rejected", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(new Uint8Array(0)));

  expect(await resolveFaviconDataUrl("https://example.com/empty.png", fetchImpl)).toBeNull();
});

test("non-http schemes are refused without touching the network", async () => {
  const fetchImpl = vi.fn(async () => imageResponse(PNG));

  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "chrome://favicon", "", 42]) {
    expect(await resolveFaviconDataUrl(url, fetchImpl)).toBeNull();
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("a thrown fetch resolves to null rather than rejecting", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("offline");
  });

  expect(await resolveFaviconDataUrl("https://example.com/x.png", fetchImpl)).toBeNull();
});

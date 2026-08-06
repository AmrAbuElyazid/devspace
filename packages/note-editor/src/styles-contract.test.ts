/**
 * Every CSS custom property this package reads has to be one the host app
 * actually defines.
 *
 * `var(--missing)` with no fallback is invalid at computed-value time, so the
 * declaration is dropped and the property silently inherits instead. Nothing
 * warns. This package shipped with `--surface-hover`, `--foreground-muted` and
 * `--foreground-faint` — none of which exist in `globals.css` — which is why the
 * slash menu had no hover or keyboard-selection highlight, the floating toolbar
 * had no hover, and the "Start writing" placeholder rendered at full foreground
 * brightness instead of muted.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, ".");
const GLOBALS = join(import.meta.dirname, "../../../apps/desktop/src/renderer/styles/globals.css");

/** Tokens defined by the browser, not by the theme. */
const BUILT_IN = new Set(["--tw-"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(tsx?|css)$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

function tokensDefinedIn(css: string): Set<string> {
  return new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]!));
}

function tokensUsedIn(source: string): string[] {
  // Only bare `var(--x)` counts — `var(--x, fallback)` degrades gracefully.
  return Array.from(source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g), (match) => match[1]!);
}

describe("css custom property contract", () => {
  const defined = new Set([
    ...tokensDefinedIn(readFileSync(GLOBALS, "utf-8")),
    ...tokensDefinedIn(readFileSync(join(SRC, "styles.css"), "utf-8")),
  ]);

  const usages = sourceFiles(SRC).flatMap((file) =>
    tokensUsedIn(readFileSync(file, "utf-8")).map((token) => ({ file, token })),
  );

  test("the package reads at least some tokens", () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  test("every token the package reads is defined by the host app", () => {
    const missing = usages
      .filter(({ token }) => !defined.has(token))
      .filter(({ token }) => !Array.from(BUILT_IN).some((prefix) => token.startsWith(prefix)))
      .map(({ file, token }) => `${token} (${file.slice(SRC.length + 1)})`);

    expect([...new Set(missing)]).toEqual([]);
  });
});

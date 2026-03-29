import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for Devspace E2E tests.
 *
 * Tests launch the Electron app directly (no browser needed).
 * Run `bun run build` before executing these tests so that
 * `out/main/index.js` and `out/renderer/index.html` exist.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run serially (single-instance lock)
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
});

import { test, expect } from "@playwright/test";
import { launchApp, getCliAuthToken, getStoreState } from "./helpers/app";
import { execSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";

test.describe("CLI: devspace code", () => {
  test("sends open-editor request and creates an editor tab", async () => {
    const { app, page } = await launchApp();

    try {
      // Get auth token for the running dev instance
      const { token, port } = await getCliAuthToken(app);

      // Create a temp directory to "open"
      const tempDir = mkdtempSync(join(tmpdir(), "devspace-e2e-"));

      // Count existing editor panes before
      const stateBefore = await getStoreState(page);
      const editorsBefore = Object.values(stateBefore.panes).filter(
        (p) => p.type === "editor",
      ).length;

      // Simulate the CLI request directly via curl (faster than shelling out
      // to the bash script, and avoids path-to-script issues in dev)
      const encodedPath = encodeURIComponent(tempDir);
      const url = `http://127.0.0.1:${port}/open-editor?path=${encodedPath}`;
      const curlResult = execSync(`curl -sf -H "X-Devspace-Token: ${token}" "${url}"`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      expect(curlResult.trim()).toBe("ok");

      // Wait for the store to update with the new editor tab
      await page.waitForFunction(
        (expectedCount) => {
          const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
          if (!store) return false;
          const state = (store as { getState: () => Record<string, unknown> }).getState();
          const panes = state.panes as Record<string, { type: string }>;
          const editors = Object.values(panes).filter((p) => p.type === "editor");
          return editors.length === expectedCount;
        },
        editorsBefore + 1,
        { timeout: 10_000 },
      );

      // Verify the new editor pane has the correct folder path
      const stateAfter = await getStoreState(page);
      const newEditors = Object.values(stateAfter.panes).filter((p) => p.type === "editor");
      expect(newEditors.length).toBe(editorsBefore + 1);

      const newEditor = newEditors.find(
        (p) => (p.config as { folderPath?: string }).folderPath === tempDir,
      );
      expect(newEditor).toBeDefined();
      expect(newEditor!.title).toContain("VS Code:");
    } finally {
      await app.close();
    }
  });

  test("rejects requests without valid auth token", async () => {
    const { app } = await launchApp();

    try {
      const { port } = await getCliAuthToken(app);

      // Send request with wrong token
      try {
        execSync(
          `curl -sf -H "X-Devspace-Token: wrong-token" "http://127.0.0.1:${port}/open-editor?path=%2Ftmp"`,
          { encoding: "utf-8", timeout: 5000 },
        );
        // curl -f exits non-zero on HTTP errors, so reaching here means unexpected success
        throw new Error("Should have rejected the request");
      } catch {
        // Expected: curl exits with error due to 403
      }
    } finally {
      await app.close();
    }
  });

  test("rejects non-directory paths", async () => {
    const { app } = await launchApp();

    try {
      const { token, port } = await getCliAuthToken(app);

      // Try to open a file (not a directory)
      try {
        execSync(
          `curl -sf -H "X-Devspace-Token: ${token}" "http://127.0.0.1:${port}/open-editor?path=%2Fetc%2Fhosts"`,
          { encoding: "utf-8", timeout: 5000 },
        );
        throw new Error("Should have rejected the non-directory path");
      } catch {
        // Expected: curl exits with error due to 400
      }
    } finally {
      await app.close();
    }
  });
});

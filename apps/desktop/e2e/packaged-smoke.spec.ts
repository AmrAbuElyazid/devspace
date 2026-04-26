import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { launchApp } from "./helpers/app";

const packagedExecutablePath = process.env.DEVSPACE_E2E_PACKAGED_EXECUTABLE?.trim();

test.describe("Packaged app smoke", () => {
  test.skip(!packagedExecutablePath, "DEVSPACE_E2E_PACKAGED_EXECUTABLE is required");

  test("launches the packaged app and exposes updater state", async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "devspace-packaged-smoke-"));
    const { app, page } = await launchApp({
      executablePath: packagedExecutablePath,
      env: {
        DEVSPACE_DISABLE_AUTO_UPDATE: "1",
        DEVSPACE_DISABLE_SINGLE_INSTANCE_LOCK: "1",
        DEVSPACE_USER_DATA_PATH: userDataPath,
      },
    });

    try {
      await expect(page.locator(".app-shell")).toBeVisible();

      const updateState = await page.evaluate(async () => {
        return window.api.app.getUpdateState();
      });

      expect(updateState.enabled).toBe(false);
      expect(updateState.status).toBe("disabled");
      expect(updateState.disabledReason).toContain("DEVSPACE_DISABLE_AUTO_UPDATE");
      expect(updateState.currentVersion).toBeTruthy();
    } finally {
      await app.close();
      rmSync(userDataPath, { force: true, recursive: true });
    }
  });
});

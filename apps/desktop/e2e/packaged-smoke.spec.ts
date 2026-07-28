import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  cleanupManagedTmuxSessions,
  getPerformanceSnapshot,
  getStoreState,
  launchApp,
} from "./helpers/app";

const packagedExecutablePath = process.env.DEVSPACE_E2E_PACKAGED_EXECUTABLE?.trim();

test.describe("Packaged app smoke", () => {
  test.skip(!packagedExecutablePath, "DEVSPACE_E2E_PACKAGED_EXECUTABLE is required");

  test("launches a packaged managed terminal and exposes updater state", async () => {
    if (!packagedExecutablePath) throw new Error("Packaged executable path is required");
    const userDataPath = mkdtempSync(join(tmpdir(), "ds-package-"));
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

      const state = await getStoreState(page);
      const terminalPane = Object.values(state.panes).find((pane) => pane.type === "terminal");
      const terminalConfig = terminalPane?.config as
        | { backend?: string; sessionId?: string }
        | undefined;
      expect(terminalConfig?.backend).toBe("managed-tmux");
      expect(terminalConfig?.sessionId).toBeTruthy();
      const managedSessionId = terminalConfig?.sessionId;

      await expect
        .poll(async () => (await getPerformanceSnapshot(page)).terminalSurfaces.ready, {
          timeout: 15_000,
        })
        .toBeGreaterThan(0);

      const managedSessions = await page.evaluate(() => window.api.terminal.listManagedSessions());
      if ("error" in managedSessions) throw new Error(managedSessions.error);
      expect(
        managedSessions.sessions.some((session) => session.sessionId === managedSessionId),
      ).toBe(true);

      const updateState = await page.evaluate(async () => {
        const api = (
          window as unknown as {
            api: { app: { getUpdateState: () => Promise<Record<string, unknown>> } };
          }
        ).api;
        return api.app.getUpdateState();
      });

      expect(updateState.enabled).toBe(false);
      expect(updateState.status).toBe("disabled");
      expect(updateState.disabledReason).toContain("DEVSPACE_DISABLE_AUTO_UPDATE");
      expect(updateState.currentVersion).toBeTruthy();
    } finally {
      try {
        await cleanupManagedTmuxSessions(page);
      } finally {
        await app.close();
      }
      rmSync(userDataPath, { force: true, recursive: true });
    }
  });
});

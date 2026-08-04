import { expect, test, type ElectronApplication } from "@playwright/test";
import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { cleanupManagedTmuxSessions, getStoreState, launchApp } from "./helpers/app";

const execFileAsync = promisify(execFile);
const TMUX = join(__dirname, "../resources/bin/tmux");
const PORT = 5199;

/**
 * Port scanning only runs while the window is focused, and a headless CI
 * machine gives the window nothing to be focused against — so the test has to
 * put it in front itself, the same way a user coming back to the app would.
 */
async function focusWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    electronApp.focus({ steal: true });
    BrowserWindow.getAllWindows()[0]?.focus();
  });
}

test.describe("Dev server ports", () => {
  test("shows a listening port on the workspace row and clears it when it stops", async () => {
    test.setTimeout(120_000);
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-ports-"));
    const socketPath = join(userDataPath, "tmux/managed.sock");
    let running: Awaited<ReturnType<typeof launchApp>> | null = null;

    let sessionId = "";
    const sendKeys = (keys: string): Promise<unknown> =>
      execFileAsync(TMUX, ["-S", socketPath, "send-keys", "-t", `devspace-${sessionId}`, keys]);

    try {
      running = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
      const { app, page } = running;

      await expect
        .poll(
          async () => {
            const state = await getStoreState(page);
            const terminal = Object.values(state.panes).find((pane) => pane.type === "terminal");
            sessionId = (terminal?.config as { sessionId?: string } | undefined)?.sessionId ?? "";
            return sessionId;
          },
          { timeout: 20_000 },
        )
        .not.toBe("");

      await focusWindow(app);
      await sendKeys(`python3 -m http.server ${PORT}`);
      await sendKeys("Enter");

      const pill = page.getByText(`:${PORT}`);
      await expect(pill).toBeVisible({ timeout: 30_000 });
      await expect(pill).toHaveAttribute("title", `Listening on port ${PORT}`);

      await sendKeys("C-c");
      await focusWindow(app);
      await expect(pill).toBeHidden({ timeout: 30_000 });
    } finally {
      if (running) {
        await cleanupManagedTmuxSessions(running.page);
        await running.app.close();
      }
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

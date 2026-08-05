import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { cleanupManagedTmuxSessions, launchApp } from "./helpers/app";
import { requireCursorDriver } from "./helpers/cursor";

const execFileAsync = promisify(execFile);

/**
 * Type through the OS rather than into Chromium.
 *
 * `page.keyboard` injects straight into the renderer, so it lands in whatever
 * the DOM thinks is focused — which is exactly the thing that lies here. A
 * field can hold `document.activeElement` while AppKit has handed the keyboard
 * to the terminal's view beside it, and only a real keystroke can tell.
 */
async function typeThroughOs(text: string): Promise<void> {
  await execFileAsync("/usr/bin/osascript", [
    "-e",
    `tell application "System Events" to keystroke ${JSON.stringify(text)}`,
  ]);
}

/**
 * Waits until this app is the one a System Events keystroke would reach.
 *
 * Activation is asynchronous, and the suite runs several apps in a row — a
 * keystroke sent a moment early lands in whatever was still frontmost, which
 * looks exactly like the bug under test.
 */
async function waitUntilFrontmost(app: ElectronApplication): Promise<void> {
  await expect
    .poll(
      async () => {
        const focused = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
          electronApp.focus({ steal: true });
          const window = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
          window?.focus();
          return window?.isFocused() ?? false;
        });
        if (!focused) return false;
        const { stdout } = await execFileAsync("/usr/bin/osascript", [
          "-e",
          'tell application "System Events" to name of first application process whose frontmost is true',
        ]);
        return stdout.trim() === "Electron";
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

function workspaceNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
      getState: () => Record<string, unknown>;
    };
    return (store.getState().workspaces as { name: string }[]).map((w) => w.name);
  });
}

/** Clicks a labelled row in the open overlay menu. */
async function chooseMenuItem(app: ElectronApplication, label: string): Promise<void> {
  const clicked = await app.evaluate(async ({ BrowserWindow }, wanted: string) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.getParentWindow() || !window.isVisible()) continue;
      return window.webContents.executeJavaScript(
        `(() => {
          const row = [...document.querySelectorAll('[role="menuitem"]')]
            .find((n) => n.textContent.trim() === ${JSON.stringify(wanted)});
          if (!row) return false;
          row.click();
          return true;
        })()`,
      ) as Promise<boolean>;
    }
    return false;
  }, label);
  expect(clicked).toBe(true);
}

test.describe("Sidebar rename", () => {
  test("the rename field keeps the keyboard after the context menu closes", async () => {
    test.setTimeout(120_000);
    // The menu is a child window; dismissing it refocuses the parent, which is
    // the event that used to hand the keyboard back to the terminal. Only a
    // real right-click goes through that path.
    const drag = await requireCursorDriver();
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-rename-"));
    let running: Awaited<ReturnType<typeof launchApp>> | null = null;

    try {
      running = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
      const { app, page } = running;

      const bounds = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
        electronApp.focus({ steal: true });
        const window = BrowserWindow.getAllWindows()[0];
        window?.setBounds({ x: 60, y: 60, width: 1200, height: 800 });
        window?.focus();
        return window?.getContentBounds() ?? null;
      });
      if (!bounds) throw new Error("no window bounds");
      await waitUntilFrontmost(app);
      await page.waitForTimeout(1_000);

      const row = page.locator("[data-sortable-id^='ws-']").first();
      const box = await row.boundingBox();
      if (!box) throw new Error("no workspace row");

      // Left-click first so the row is the one under the cursor, then open its
      // menu the way a user would.
      await drag(
        bounds.x + box.x + 40,
        bounds.y + box.y + 12,
        bounds.x + box.x + 40,
        bounds.y + box.y + 12,
        1,
      );
      await row.click({ button: "right" });
      await page.waitForTimeout(800);

      await chooseMenuItem(app, "Rename");
      await page.waitForTimeout(800);

      await expect(page.getByLabel("Rename workspace")).toBeFocused();

      await typeThroughOs("renamed");
      await page.waitForTimeout(400);
      await execFileAsync("/usr/bin/osascript", [
        "-e",
        'tell application "System Events" to key code 36',
      ]);
      await page.waitForTimeout(600);

      expect(await workspaceNames(page)).toContain("renamed");
    } finally {
      if (running) {
        await cleanupManagedTmuxSessions(running.page);
        await running.app.close();
      }
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

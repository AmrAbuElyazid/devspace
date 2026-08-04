import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { cleanupManagedTmuxSessions, getNativeViewSnapshot, launchApp } from "./helpers/app";

const execFileAsync = promisify(execFile);

/**
 * A real OS-level cursor drag, built from a small CGEvent program.
 *
 * Playwright's own mouse actions are injected straight into Chromium, so they
 * never meet the AppKit hit-testing that decides whether a native pane
 * swallows a drag — which is the entire thing under test here. Needs
 * Accessibility permission for whatever runs the suite.
 *
 *   swiftc -O -o /tmp/devspace-mouse/drag e2e/fixtures/drag.swift
 */
const DRAG = "/tmp/devspace-mouse/drag";

async function sidebarWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const aside = document.querySelector('[aria-label="Resize sidebar"]')?.parentElement;
    return aside ? Math.round(aside.getBoundingClientRect().width) : 0;
  });
}

async function openBrowserPane(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
      getState: () => Record<string, unknown>;
    };
    const state = store.getState();
    const workspaces = state.workspaces as { id: string; focusedGroupId?: string }[];
    const workspace = workspaces.find((w) => w.id === state.activeWorkspaceId) ?? workspaces[0];
    const groupId =
      workspace.focusedGroupId ?? Object.keys(state.paneGroups as Record<string, unknown>)[0];
    (state.splitGroup as (a: string, b: string, c: string) => void)(
      workspace.id,
      groupId,
      "horizontal",
    );
    const after = store.getState();
    const nextWorkspace = (after.workspaces as { id: string; focusedGroupId?: string }[]).find(
      (w) => w.id === after.activeWorkspaceId,
    );
    (after.openBrowserInGroup as (a: string, b: string, c: string) => void)(
      nextWorkspace!.id,
      nextWorkspace!.focusedGroupId!,
      "about:blank",
    );
  });
  await page.waitForSelector('input[aria-label="Address and search bar"]', { timeout: 20_000 });
}

/** Screen-space content rect, with the window parked somewhere predictable. */
async function placeWindow(
  app: ElectronApplication,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const bounds = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    electronApp.focus({ steal: true });
    const window = BrowserWindow.getAllWindows()[0];
    window?.setBounds({ x: 60, y: 60, width: 1200, height: 800 });
    window?.focus();
    return window?.getContentBounds() ?? null;
  });
  if (!bounds) throw new Error("no window bounds");
  return bounds;
}

test.describe("Sidebar resize", () => {
  test("a real cursor drag across the panes resizes without hiding them", async () => {
    test.setTimeout(120_000);
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-resize-"));
    let running: Awaited<ReturnType<typeof launchApp>> | null = null;

    try {
      running = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
      const { app, page } = running;

      // Both native view kinds under the cursor's path: a terminal is an
      // NSView the Ghostty bridge owns, a browser pane is a WebContentsView
      // Chromium owns, and they route mouse events differently.
      await openBrowserPane(page);
      const bounds = await placeWindow(app);
      await page.waitForTimeout(1_000);

      const before = await sidebarWidth(page);
      const y = bounds.y + Math.round(bounds.height / 2);

      // Sampled during the drag, not after: a hide that has already been undone
      // by the time the release lands is exactly the flicker being tested for.
      const hiddenDuringDrag: boolean[] = [];
      const sampler = setInterval(() => {
        void getNativeViewSnapshot(page)
          .then((snapshot) => hiddenDuringDrag.push(snapshot.hiddenByDrag))
          .catch(() => {});
      }, 40);

      // Well past the 420px clamp, so the button comes up deep inside the pane
      // area rather than on the divider it was pressed on.
      await execFileAsync(DRAG, [
        String(bounds.x + before - 2),
        String(y),
        String(bounds.x + before + 460),
        String(y),
        "30",
      ]);
      clearInterval(sampler);
      await page.waitForTimeout(400);

      const widened = await sidebarWidth(page);
      expect(widened).toBe(420);
      expect(hiddenDuringDrag).not.toContain(true);
      expect((await getNativeViewSnapshot(page)).hiddenByDrag).toBe(false);

      // Stuck-in-resize is the other failure mode: the divider keeps tracking
      // the cursor after a release the renderer never saw.
      await execFileAsync(DRAG, [
        String(bounds.x + 700),
        String(y),
        String(bounds.x + 900),
        String(y),
        "10",
      ]);
      await page.waitForTimeout(300);
      expect(await sidebarWidth(page)).toBe(widened);

      // And back, so the drag is exercised in both directions.
      await execFileAsync(DRAG, [
        String(bounds.x + widened - 2),
        String(y),
        String(bounds.x + widened - 162),
        String(y),
        "20",
      ]);
      await page.waitForTimeout(400);
      expect(await sidebarWidth(page)).toBe(widened - 160);
    } finally {
      if (running) {
        await cleanupManagedTmuxSessions(running.page);
        await running.app.close();
      }
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

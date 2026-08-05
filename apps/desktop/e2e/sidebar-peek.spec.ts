import { expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { cleanupManagedTmuxSessions, getStoreState, launchApp } from "./helpers/app";
import { requireCursorDriver } from "./helpers/cursor";

/** Leading pixel offset out of a computed `translate`, e.g. "-264px 0px". */
function offsetOf(value: string | undefined): number {
  return Number.parseFloat(value ?? "0") || 0;
}

/** Text painted by the peek panel, read out of the overlay window. */
async function peekRows(app: ElectronApplication): Promise<string[] | null> {
  return app.evaluate(async ({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      const parent = window.getParentWindow();
      if (!parent || !window.isVisible()) continue;
      return window.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('[role="button"]')).map((n) => n.textContent)`,
      ) as Promise<string[]>;
    }
    return null;
  });
}

test.describe("Sidebar peek", () => {
  test("the collapsed sidebar opens on hover and switches workspace on click", async () => {
    test.setTimeout(120_000);
    // The panel is opened by the main process watching the window-server
    // cursor, so nothing short of a real one will do.
    const moveCursor = await requireCursorDriver();
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-peek-"));
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
      await page.waitForTimeout(1_000);

      // A second workspace, so a click has somewhere to go.
      const second = await page.evaluate(() => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
          getState: () => Record<string, unknown>;
        };
        const id = (store.getState().addWorkspace as (name: string) => string)("second");
        (store.getState().setActiveWorkspace as (id: string) => void)(
          (store.getState().workspaces as { id: string }[])[0]!.id,
        );
        return id;
      });
      await page.waitForTimeout(600);

      // Collapse the sidebar — the panel is only offered when it is away.
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('[aria-label="Toggle sidebar"]')?.click();
      });
      await page.waitForTimeout(600);

      // Park the cursor away from the edge, then walk it in.
      await moveCursor(bounds.x + 600, bounds.y + 400, bounds.x + 3, bounds.y + 400, 16);

      await expect.poll(() => peekRows(app), { timeout: 10_000 }).not.toBeNull();
      const rows = await peekRows(app);
      expect(rows?.join(" ")).toContain("second");

      // Clicking the second row switches to it, and the panel gets out of the way.
      const rowIndex = (rows ?? []).findIndex((text) => text.includes("second"));
      expect(rowIndex).toBeGreaterThanOrEqual(0);
      const rowY = await app.evaluate(async ({ BrowserWindow }, index: number) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.getParentWindow() || !window.isVisible()) continue;
          const top = (await window.webContents.executeJavaScript(
            `document.querySelectorAll('[role="button"]')[${index}].getBoundingClientRect().top`,
          )) as number;
          return window.getBounds().y + Math.round(top) + 16;
        }
        return null;
      }, rowIndex);
      if (rowY === null) throw new Error("no peek row to click");

      await moveCursor(bounds.x + 120, rowY, bounds.x + 140, rowY, 3);
      await page.waitForTimeout(800);

      const state = await getStoreState(page);
      expect(state.activeWorkspaceId).toBe(second);

      // The panel is a glance, not a window: clicking a row must not take the
      // keyboard away from whatever pane had it.
      const focus = await app.evaluate(({ BrowserWindow }) => {
        const parent = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
        const surface = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
        return { parent: parent?.isFocused() ?? false, surface: surface?.isFocused() ?? false };
      });
      expect(focus).toEqual({ parent: true, surface: false });

      // And it closes once the cursor is back out over the panes.
      await moveCursor(bounds.x + 600, bounds.y + 400, bounds.x + 700, bounds.y + 400, 4);
      await expect.poll(() => peekRows(app), { timeout: 10_000 }).toBeNull();
    } finally {
      if (running) {
        await cleanupManagedTmuxSessions(running.page);
        await running.app.close();
      }
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

/**
 * Records the panel's own transition events inside the overlay document.
 *
 * A screenshot cannot tell a slide from an appearance, and sampling on a
 * timer from the test process races a 160ms transition. Frame-by-frame
 * recording does not work either: the overlay window is hidden between
 * reveals, and a hidden window gets no animation frames. Transition events do
 * fire, and they carry the moment the browser itself considers the slide to
 * have started.
 */
async function recordPanelTransitions(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }) => {
    const surface = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
    if (!surface) throw new Error("no overlay surface to record");
    await surface.webContents.executeJavaScript(`
      (() => {
        window.__tx = [];
        const record = (phase) => (event) => {
          const target = event.target;
          if (!(target instanceof Element) || !target.hasAttribute("data-peek-panel")) return;
          window.__tx.push([phase, event.propertyName, getComputedStyle(target).translate]);
        };
        document.addEventListener("transitionstart", record("start"), true);
        document.addEventListener("transitionend", record("end"), true);
      })()
    `);
  });
}

async function readPanelTransitions(app: ElectronApplication): Promise<string[][]> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const surface = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
    if (!surface) return [];
    return surface.webContents.executeJavaScript("window.__tx ?? []") as Promise<string[][]>;
  });
}

test("the panel slides in rather than appearing", async () => {
  test.setTimeout(120_000);
  const moveCursor = await requireCursorDriver();
  const userDataPath = await mkdtemp(join(tmpdir(), "ds-peek-anim-"));
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
    await page.waitForTimeout(1_000);

    await page.evaluate(() => {
      document.querySelector<HTMLElement>('[aria-label="Toggle sidebar"]')?.click();
    });
    await page.waitForTimeout(600);

    // One reveal to bring the overlay window into existence, then close it —
    // the recorder has to be installed in a document that already exists.
    await moveCursor(bounds.x + 600, bounds.y + 400, bounds.x + 3, bounds.y + 400, 12);
    await page.waitForTimeout(700);
    await moveCursor(bounds.x + 3, bounds.y + 400, bounds.x + 800, bounds.y + 400, 12);
    await page.waitForTimeout(700);

    await recordPanelTransitions(app);
    await moveCursor(bounds.x + 800, bounds.y + 400, bounds.x + 3, bounds.y + 400, 12);
    await page.waitForTimeout(700);
    const events = await readPanelTransitions(app);

    // `translate` rather than `transform`: Tailwind v4 moves things with the
    // standalone property, and a transition list naming the wrong one animates
    // the fade while the position snaps — which is what this caught.
    const slide = events.filter(([, property]) => property === "translate");
    expect(slide.map(([phase]) => phase)).toEqual(["start", "end"]);

    // It began off to the left and finished in place, which is the difference
    // between sliding in and simply being there.
    expect(offsetOf(slide[0]?.[2])).toBeLessThan(-20);
    expect(offsetOf(slide[1]?.[2])).toBe(0);
  } finally {
    if (running) {
      await cleanupManagedTmuxSessions(running.page);
      await running.app.close();
    }
    await rm(userDataPath, { recursive: true, force: true });
  }
});

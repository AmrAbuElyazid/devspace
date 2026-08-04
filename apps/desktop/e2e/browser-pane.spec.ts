import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";

import { launchApp } from "./helpers/app";

/** 1x1 transparent PNG, so the favicon path exercises a real image fetch. */
const FAVICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PAGE_TITLE = "Devspace E2E Fixture";

/**
 * Served locally rather than hitting a real site: these assert on a page title
 * and a favicon, and a suite that fails when a third party is slow is worse
 * than no suite.
 */
function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    if (request.url === "/favicon.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(FAVICON_PNG);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<!doctype html><html><head><title>${PAGE_TITLE}</title>` +
        `<link rel="icon" href="/favicon.png"></head><body><h1>Fixture</h1></body></html>`,
    );
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * Integration coverage for the browser pane's chrome.
 *
 * These exist because the failure modes here are invisible to unit tests. The
 * overlay menu is rendered by a *second* renderer process, so a broken IPC
 * handshake, an opaque background or a lost z-order all leave the unit suite
 * green while the menu never appears. Likewise the address-bar focus depends on
 * real pane lifecycle ordering, and the favicon on a main-process fetch.
 */

/** Opens a browser pane in the focused group and returns its pane id. */
async function openBrowserPane(page: Page, url: string): Promise<string> {
  const paneId = await page.evaluate((target) => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
      getState: () => Record<string, unknown>;
    };
    const state = store.getState();
    const workspaces = state.workspaces as { id: string; focusedGroupId?: string }[];
    const ws = workspaces.find((w) => w.id === state.activeWorkspaceId) ?? workspaces[0];
    const groupId =
      ws.focusedGroupId ?? Object.keys(state.paneGroups as Record<string, unknown>)[0];
    (state.openBrowserInGroup as (a: string, b: string, c: string) => void)(ws.id, groupId, target);

    const after = store.getState();
    const group = (
      after.paneGroups as Record<
        string,
        { activeTabId: string; tabs: { id: string; paneId: string }[] }
      >
    )[groupId];
    return group.tabs.find((t) => t.id === group.activeTabId)?.paneId ?? "";
  }, url);

  await page.waitForSelector('input[aria-label="Address and search bar"]', { timeout: 20_000 });
  return paneId;
}

function visibleBrowserViews(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nv = (window as unknown as Record<string, unknown>).__DEVSPACE_NATIVE_VIEWS__ as {
      getSnapshot: () => { visible: { browsers: number } };
    };
    return nv.getSnapshot().visible.browsers;
  });
}

test("the toolbar menu opens over the page without hiding it", async () => {
  const fixture = await startFixtureServer();
  const { app, page } = await launchApp();

  try {
    await page.waitForTimeout(1500);
    await openBrowserPane(page, fixture.url);
    await page.waitForTimeout(2500);

    const before = await visibleBrowserViews(page);
    expect(before).toBeGreaterThan(0);

    await page.locator('button[aria-label="Browser menu"]:visible').first().click();
    await page.waitForTimeout(800);

    // The pane must not yield its view: the overlay draws above it instead.
    expect(await visibleBrowserViews(page)).toBe(before);

    const overlay = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const view = (win?.contentView.children ?? []).find((candidate) => {
        const wc = (candidate as unknown as { webContents?: Electron.WebContents }).webContents;
        return wc && !wc.isDestroyed() && wc.getURL().includes("#overlay");
      });
      if (!view) return null;

      const wc = (view as unknown as { webContents: Electron.WebContents }).webContents;
      return {
        isTopmost: win?.contentView.children[win.contentView.children.length - 1] === view,
        hasFocus: await wc.executeJavaScript("document.hasFocus()"),
        menus: await wc.executeJavaScript("document.querySelectorAll('[role=menu]').length"),
        items: await wc.executeJavaScript("document.querySelectorAll('[role=menuitem]').length"),
      };
    });

    expect(overlay).not.toBeNull();
    // A menu posted before the overlay subscribed would render nothing at all.
    expect(overlay?.menus).toBe(1);
    expect(overlay?.items).toBeGreaterThan(3);
    expect(overlay?.isTopmost).toBe(true);
    expect(overlay?.hasFocus).toBe(true);

    const dismissed = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const view = (win?.contentView.children ?? []).find((candidate) => {
        const wc = (candidate as unknown as { webContents?: Electron.WebContents }).webContents;
        return wc && !wc.isDestroyed() && wc.getURL().includes("#overlay");
      });
      const wc = (view as unknown as { webContents: Electron.WebContents }).webContents;

      // Keys land in the overlay's own webContents, not the main renderer's.
      wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      return {
        menus: await wc.executeJavaScript("document.querySelectorAll('[role=menu]').length"),
        // Must stop covering the pane, or it keeps swallowing its mouse input.
        visible: (view as unknown as { getVisible: () => boolean }).getVisible(),
      };
    });

    expect(dismissed.menus).toBe(0);
    expect(dismissed.visible).toBe(false);
  } finally {
    await app.close();
    await fixture.close();
  }
});

test("device mode frames the pane and keeps the guest at its requested width", async () => {
  const fixture = await startFixtureServer();
  const { app, page } = await launchApp();

  try {
    await page.waitForTimeout(1500);
    await openBrowserPane(page, fixture.url);
    await page.waitForTimeout(2000);

    await page.locator('button[aria-label="Toggle device mode"]:visible').first().click();
    await page.waitForSelector('[role="toolbar"][aria-label="Device viewport"]', {
      timeout: 5_000,
    });

    const width = page.locator('input[aria-label="Viewport width"]:visible').first();
    const height = page.locator('input[aria-label="Viewport height"]:visible').first();

    // Typing a size and pressing Enter must apply it: the field group has no
    // submit button, so browsers never fire implicit submission here.
    await width.fill("390");
    await height.fill("844");
    await height.press("Enter");
    await page.waitForTimeout(600);

    await expect(width).toHaveValue("390");
    await expect(height).toHaveValue("844");

    // A device wider than the pane scales down on screen but must still report
    // its requested CSS width, or media queries fire at the wrong breakpoint.
    await width.fill("2400");
    await width.press("Enter");
    await page.waitForTimeout(800);

    const scaled = await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"][aria-label="Device viewport"]');
      return bar ? (bar as HTMLElement).innerText.replace(/\s+/g, " ") : null;
    });
    // The fit indicator only appears when the frame had to be scaled.
    expect(scaled).toMatch(/\d+%/);

    await page.locator('button[aria-label="Exit device mode"]:visible').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('[role="toolbar"][aria-label="Device viewport"]')).toHaveCount(0);
  } finally {
    await app.close();
    await fixture.close();
  }
});

test("a new blank pane focuses its address bar and titles itself on navigation", async () => {
  const fixture = await startFixtureServer();
  const { app, page } = await launchApp();

  try {
    await page.waitForTimeout(1500);

    const paneId = await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
        getState: () => Record<string, unknown>;
      };
      const state = store.getState();
      const workspaces = state.workspaces as { id: string; focusedGroupId?: string }[];
      const ws = workspaces.find((w) => w.id === state.activeWorkspaceId) ?? workspaces[0];
      const groupId =
        ws.focusedGroupId ?? Object.keys(state.paneGroups as Record<string, unknown>)[0];
      (state.addGroupTab as (a: string, b: string, c: string) => void)(ws.id, groupId, "browser");

      const after = store.getState();
      const group = (
        after.paneGroups as Record<
          string,
          { activeTabId: string; tabs: { id: string; paneId: string }[] }
        >
      )[groupId];
      return group.tabs.find((t) => t.id === group.activeTabId)?.paneId ?? "";
    });

    await page.waitForSelector('input[aria-label="Address and search bar"]', { timeout: 20_000 });
    await page.waitForTimeout(1200);

    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null),
    ).toBe("Address and search bar");

    await page.evaluate(
      ({ id, url }) => {
        void window.api.browser.navigate(id, url);
      },
      { id: paneId, url: fixture.url },
    );
    await page.waitForTimeout(3500);

    const pane = await page.evaluate((id) => {
      const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
        getState: () => Record<string, unknown>;
      };
      const panes = store.getState().panes as Record<
        string,
        { title: string; config: { faviconUrl?: string } }
      >;
      return { title: panes[id]?.title ?? null, favicon: panes[id]?.config.faviconUrl ?? null };
    }, paneId);

    // Browser panes used to sit on the generic "Browser" forever.
    expect(pane.title).not.toBe("Browser");
    expect(pane.title).toBe(PAGE_TITLE);
    expect(pane.favicon).toContain("/favicon.png");
  } finally {
    await app.close();
    await fixture.close();
  }
});

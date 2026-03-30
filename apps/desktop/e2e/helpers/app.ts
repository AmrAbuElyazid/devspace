import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(__dirname, "../..");

/**
 * Launch the Devspace Electron app for E2E testing.
 *
 * Requires a prior `bun run build` so that `out/main/index.js` exists.
 */
export async function launchApp(): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  const app = await electron.launch({
    args: [join(PROJECT_ROOT, "out/main/index.js")],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  // Wait for the first BrowserWindow to appear
  const page = await app.firstWindow();

  // Wait for the renderer to be fully loaded
  await page.waitForSelector(".app-shell", { timeout: 30_000 });

  return { app, page };
}

/**
 * Read the CLI auth token for the dev port.
 *
 * Gets the userData path from Electron (minimal evaluate — no imports),
 * then reads the token file from the test process where `fs` is available.
 */
export async function getCliAuthToken(app: ElectronApplication): Promise<{
  token: string;
  port: number;
}> {
  // Get userData path from Electron — no imports needed
  const userDataPath: string = await app.evaluate(({ app: electronApp }) => {
    return electronApp.getPath("userData");
  });

  // Dev mode uses port 21649 (21549 + 100 offset)
  const port = 21649;
  const tokenPath = join(userDataPath, "cli", `token.${port}`);
  const token = readFileSync(tokenPath, "utf-8");
  return { token, port };
}

/**
 * Query the workspace Zustand store from the renderer process.
 */
export async function getStoreState(page: Page): Promise<{
  activeWorkspaceId: string;
  workspaceCount: number;
  panes: Record<string, { id: string; type: string; title: string; config: unknown }>;
  paneGroups: Record<string, { id: string; tabs: { id: string; paneId: string }[] }>;
}> {
  return page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
    if (!store) {
      throw new Error("Store not available — __DEVSPACE_STORE__ not on window");
    }

    const state = (store as { getState: () => Record<string, unknown> }).getState();
    return {
      activeWorkspaceId: state.activeWorkspaceId as string,
      workspaceCount: (state.workspaces as unknown[]).length,
      panes: state.panes as Record<
        string,
        { id: string; type: string; title: string; config: unknown }
      >,
      paneGroups: state.paneGroups as Record<
        string,
        { id: string; tabs: { id: string; paneId: string }[] }
      >,
    };
  });
}

/**
 * Send an IPC event from the main process to the renderer.
 * This simulates events that BrowserPaneManager would normally emit.
 */
export async function sendIpcToRenderer(
  app: ElectronApplication,
  channel: string,
  payload: unknown,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { channel: ch, payload: pl }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send(ch, pl);
      }
    },
    { channel, payload },
  );
}

/**
 * Count panes of a specific type in the store.
 */
export async function countPanesByType(page: Page, type: string): Promise<number> {
  const state = await getStoreState(page);
  return Object.values(state.panes).filter((p) => p.type === type).length;
}

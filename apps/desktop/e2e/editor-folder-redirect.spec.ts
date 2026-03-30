import { test, expect } from "@playwright/test";
import { launchApp, getStoreState, sendIpcToRenderer } from "./helpers/app";

test.describe("Editor pane: folder open redirect", () => {
  test("VS Code open-folder window.open() re-navigates the editor pane instead of creating browser tab", async () => {
    const { app, page } = await launchApp();

    try {
      const stateBefore = await getStoreState(page);
      const browsersBefore = Object.values(stateBefore.panes).filter(
        (p) => p.type === "browser",
      ).length;

      // Create an editor pane in the store (simulate having an editor open)
      const editorPaneId = await page.evaluate(() => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
        const state = (store as { getState: () => Record<string, unknown> }).getState();
        const addPane = state.addPane as (type: string, config?: unknown) => string;
        return addPane("editor", { folderPath: "/tmp/original" });
      });

      expect(editorPaneId).toBeTruthy();

      // Simulate what happens when VS Code's setWindowOpenHandler fires:
      // BrowserPaneManager sends "browser:openInNewTabRequested" IPC to
      // the renderer with the editor pane's ID and a VS Code URL containing
      // ?folder=<new-path>.  The useBrowserBridge handler should detect the
      // editor pane + VS Code URL and update the existing pane instead of
      // creating a new browser tab.
      const newFolderPath = "/tmp/new-project";
      const vscodeUrl = `http://127.0.0.1:18662?folder=${encodeURIComponent(newFolderPath)}`;

      await sendIpcToRenderer(app, "browser:openInNewTabRequested", {
        paneId: editorPaneId,
        url: vscodeUrl,
      });

      // Wait for the store to reflect the folder change
      await page.waitForFunction(
        ({ paneId, expected }) => {
          const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
          if (!store) return false;
          const state = (store as { getState: () => Record<string, unknown> }).getState();
          const panes = state.panes as Record<string, { config: { folderPath?: string } }>;
          return panes[paneId]?.config.folderPath === expected;
        },
        { paneId: editorPaneId, expected: newFolderPath },
        { timeout: 5_000 },
      );

      // Verify: no new browser pane was created
      const stateAfter = await getStoreState(page);
      const browsersAfter = Object.values(stateAfter.panes).filter(
        (p) => p.type === "browser",
      ).length;
      expect(browsersAfter).toBe(browsersBefore);

      // Verify: the editor pane's config and title were updated
      const editorPane = stateAfter.panes[editorPaneId];
      expect(editorPane).toBeDefined();
      const config = editorPane!.config as { folderPath?: string };
      expect(config.folderPath).toBe(newFolderPath);
      expect(editorPane!.title).toContain("new-project");
    } finally {
      await app.close();
    }
  });
});

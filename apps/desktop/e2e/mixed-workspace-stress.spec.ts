import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  cleanupManagedTmuxSessions,
  getPerformanceSnapshot,
  getNativeViewSnapshot,
  getStoreState,
  launchApp,
  resetPerformanceCounters,
} from "./helpers/app";

test.describe("Stress: mixed workspace remounting", () => {
  test("cycles mixed workspaces without leaking visible native panes", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-mixed-"));
    const { app, page } = await launchApp({
      env: { DEVSPACE_USER_DATA_PATH: userDataPath },
    });

    try {
      await resetPerformanceCounters(page);

      const workspaceIds = await page.evaluate(() => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
        if (!store) {
          throw new Error("Store not available — __DEVSPACE_STORE__ not on window");
        }

        const state = (store as { getState: () => Record<string, unknown> }).getState();
        const addWorkspace = state.addWorkspace as (
          name?: string,
          parentFolderId?: string | null,
          container?: string,
          defaultType?: string,
        ) => string;
        const setActiveWorkspace = state.setActiveWorkspace as (id: string) => void;
        const addGroupTab = state.addGroupTab as (
          workspaceId: string,
          groupId: string,
          defaultType?: string,
        ) => void;

        const existingIds = (
          state.workspaces as Array<{ id: string; focusedGroupId: string | null }>
        ).map((workspace) => workspace.id);
        const browserWorkspaceId = addWorkspace("Browser Workspace", null, "main", "browser");
        const editorWorkspaceId = addWorkspace("Editor Workspace", null, "main", "editor");
        const t3codeWorkspaceId = addWorkspace("T3Code Workspace", null, "main", "t3code");

        const nextState = (store as { getState: () => Record<string, unknown> }).getState();
        const workspaces = nextState.workspaces as Array<{
          id: string;
          focusedGroupId: string | null;
        }>;

        for (const workspaceId of [
          existingIds[0],
          browserWorkspaceId,
          editorWorkspaceId,
          t3codeWorkspaceId,
        ]) {
          const workspace = workspaces.find((entry) => entry.id === workspaceId);
          if (!workspace?.focusedGroupId) {
            continue;
          }
          addGroupTab(workspace.id, workspace.focusedGroupId, "terminal");
        }

        setActiveWorkspace(existingIds[0]!);

        return [existingIds[0]!, browserWorkspaceId, editorWorkspaceId, t3codeWorkspaceId];
      });

      const stateAfterSetup = await getStoreState(page);
      expect(stateAfterSetup.workspaceCount).toBeGreaterThanOrEqual(4);

      await page.waitForTimeout(500);

      for (const workspaceId of workspaceIds) {
        await page.evaluate((id) => {
          const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
          if (!store) {
            throw new Error("Store not available — __DEVSPACE_STORE__ not on window");
          }

          const state = (store as { getState: () => Record<string, unknown> }).getState();
          (state.setActiveWorkspace as (workspaceId: string) => void)(id);
        }, workspaceId);

        await page.waitForTimeout(200);

        const snapshot = await getNativeViewSnapshot(page);
        expect(snapshot.hiddenByOverlay).toBe(false);
        expect(snapshot.hiddenByDrag).toBe(false);
        expect(snapshot.visible.total).toBeLessThanOrEqual(1);
      }

      const snapshotAfterWarmup = await getNativeViewSnapshot(page);

      for (let i = 0; i < 2; i++) {
        for (const workspaceId of workspaceIds) {
          await page.evaluate((id) => {
            const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
            if (!store) {
              throw new Error("Store not available — __DEVSPACE_STORE__ not on window");
            }

            const state = (store as { getState: () => Record<string, unknown> }).getState();
            (state.setActiveWorkspace as (workspaceId: string) => void)(id);
          }, workspaceId);

          await page.waitForTimeout(200);

          const snapshot = await getNativeViewSnapshot(page);
          expect(snapshot.hiddenByOverlay).toBe(false);
          expect(snapshot.hiddenByDrag).toBe(false);
          expect(snapshot.visible.total).toBeLessThanOrEqual(1);
        }
      }

      const snapshotAfterCycles = await getNativeViewSnapshot(page);
      expect(snapshotAfterCycles.registered.total).toBe(snapshotAfterWarmup.registered.total);
      expect(snapshotAfterCycles.visible.total).toBeLessThanOrEqual(1);
      expect(snapshotAfterCycles.counters.reconcileCalls).toBeGreaterThan(0);
      expect(snapshotAfterCycles.counters.visibleBoundsSyncPasses).toBeGreaterThan(0);

      const performanceSnapshot = await getPerformanceSnapshot(page);
      expect(performanceSnapshot.nativeViews.timings.reconcile?.count ?? 0).toBeGreaterThan(0);
      expect(performanceSnapshot.nativeViews.timings.visibleBoundsSync?.count ?? 0).toBeGreaterThan(
        0,
      );
      expect(performanceSnapshot.main.process.memory.rss).toBeGreaterThan(0);
      expect(
        performanceSnapshot.main.operations["terminal.setVisibleSurfaces"]?.count ?? 0,
      ).toBeGreaterThan(0);
    } finally {
      try {
        await cleanupManagedTmuxSessions(page);
      } finally {
        await app.close();
      }
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

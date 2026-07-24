import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  cleanupManagedTmuxSessions,
  getNativeViewSnapshot,
  getPerformanceSnapshot,
  getStoreState,
  launchApp,
  resetPerformanceCounters,
} from "./helpers/app";

const TERMINAL_COUNT = 8;
const INACTIVE_MANAGED_SURFACE_BUDGET = 6;
const INITIAL_WORKSPACE_SURFACE_COUNT = 1;

function getOperationCount(
  snapshot: Awaited<ReturnType<typeof getPerformanceSnapshot>>,
  name: string,
): number {
  return snapshot.main.operations[name]?.count ?? 0;
}

function summarizeWorkingSetByType(
  snapshot: Awaited<ReturnType<typeof getPerformanceSnapshot>>,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const metric of snapshot.main.appMetrics) {
    const current = totals[metric.type] ?? 0;
    totals[metric.type] = current + (metric.memory.workingSetSize ?? 0);
  }

  return totals;
}

test.describe("Stress: hidden terminal retention", () => {
  test("reattaches the same managed session after a full app restart", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-restart-"));
    let runningApp: Awaited<ReturnType<typeof launchApp>> | null = null;

    try {
      runningApp = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
      await expect
        .poll(async () => (await getPerformanceSnapshot(runningApp!.page)).terminalSurfaces.ready, {
          timeout: 15_000,
        })
        .toBeGreaterThan(0);

      const firstState = await getStoreState(runningApp.page);
      const firstTerminal = Object.values(firstState.panes).find(
        (pane) => pane.type === "terminal",
      );
      const firstConfig = firstTerminal?.config as
        | { backend?: string; sessionId?: string }
        | undefined;
      expect(firstConfig?.backend).toBe("managed-tmux");
      expect(firstConfig?.sessionId).toBeTruthy();

      await runningApp.page.evaluate((paneId) => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as
          | { getState: () => Record<string, unknown> }
          | undefined;
        if (!store) throw new Error("Store not available");
        const state = store.getState();
        (state.updatePaneTitle as (id: string, title: string) => void)(paneId, "Continuity Test");
      }, firstTerminal!.id);
      await runningApp.page.waitForTimeout(750);

      await runningApp.app.close();
      runningApp = null;

      runningApp = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
      await expect
        .poll(async () => (await getPerformanceSnapshot(runningApp!.page)).terminalSurfaces.ready, {
          timeout: 15_000,
        })
        .toBeGreaterThan(0);

      const restoredState = await getStoreState(runningApp.page);
      const restoredTerminal = Object.values(restoredState.panes).find(
        (pane) => pane.type === "terminal",
      );
      expect(restoredTerminal?.config).toMatchObject({
        backend: "managed-tmux",
        sessionId: firstConfig!.sessionId,
      });

      const listed = await runningApp.page.evaluate(() =>
        window.api.terminal.listManagedSessions(),
      );
      if ("error" in listed) throw new Error(listed.error);
      expect(listed.sessions.some((session) => session.sessionId === firstConfig!.sessionId)).toBe(
        true,
      );
    } finally {
      if (runningApp) {
        try {
          await cleanupManagedTmuxSessions(runningApp.page);
        } finally {
          await runningApp.app.close();
        }
        await rm(userDataPath, { recursive: true, force: true });
      }
    }
  });

  test("bounds managed client surfaces while retaining every tmux session", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-hidden-"));
    const { app, page } = await launchApp({
      env: {
        DEVSPACE_USER_DATA_PATH: userDataPath,
      },
    });
    try {
      // The default workspace terminal starts asynchronously. Let that startup
      // finish before zeroing counters so only this scenario is measured.
      await expect
        .poll(async () => (await getPerformanceSnapshot(page)).terminalSurfaces.ready, {
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      await resetPerformanceCounters(page);

      const scenario = await page.evaluate((terminalCount) => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
        if (!store) {
          throw new Error("Store not available — __DEVSPACE_STORE__ missing");
        }

        const getState = (store as { getState: () => Record<string, unknown> }).getState;
        const state = getState();
        const baselineWorkspaceId = state.activeWorkspaceId as string;
        const addWorkspace = state.addWorkspace as (
          name?: string,
          parentFolderId?: string | null,
          container?: string,
          defaultType?: string,
        ) => string;
        const addGroupTab = state.addGroupTab as (
          workspaceId: string,
          groupId: string,
          defaultType?: string,
        ) => void;

        const retentionWorkspaceId = addWorkspace("Retention Workspace", null, "main", "terminal");
        const retentionWorkspace = (
          getState().workspaces as Array<{ id: string; focusedGroupId: string | null }>
        ).find((workspace) => workspace.id === retentionWorkspaceId);
        const groupId = retentionWorkspace?.focusedGroupId;
        if (!groupId) {
          throw new Error("Retention workspace missing focused group");
        }

        for (let i = 1; i < terminalCount; i++) {
          addGroupTab(retentionWorkspaceId, groupId, "terminal");
        }

        const nextState = getState();
        const group = (
          nextState.paneGroups as Record<string, { tabs: Array<{ id: string; paneId: string }> }>
        )[groupId];
        if (!group) {
          throw new Error("Retention group missing after tab creation");
        }

        return {
          baselineWorkspaceId,
          retentionWorkspaceId,
          groupId,
          tabIds: group.tabs.map((tab) => tab.id),
          sessionIds: group.tabs.map((tab) => {
            const pane = (
              nextState.panes as Record<
                string,
                { config: { backend?: string; sessionId?: string } }
              >
            )[tab.paneId];
            if (pane?.config.backend !== "managed-tmux" || !pane.config.sessionId) {
              throw new Error("Expected a managed terminal pane");
            }
            return pane.config.sessionId;
          }),
        };
      }, TERMINAL_COUNT);
      await page.waitForTimeout(500);

      const baseline = await getPerformanceSnapshot(page);
      const baselineNativeViews = await getNativeViewSnapshot(page);

      for (const tabId of scenario.tabIds) {
        await page.evaluate(
          ({ retentionWorkspaceId, groupId, tabId }) => {
            const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
            if (!store) {
              throw new Error("Store not available — __DEVSPACE_STORE__ missing");
            }

            const state = (store as { getState: () => Record<string, unknown> }).getState();
            (
              state.setActiveGroupTab as (
                workspaceId: string,
                groupId: string,
                tabId: string,
              ) => void
            )(retentionWorkspaceId, groupId, tabId);
          },
          {
            retentionWorkspaceId: scenario.retentionWorkspaceId,
            groupId: scenario.groupId,
            tabId,
          },
        );

        await page.waitForTimeout(250);
      }

      await expect
        .poll(async () => {
          const snapshot = await getPerformanceSnapshot(page);
          return snapshot.terminalSurfaces.lifecycle.ready ===
            snapshot.terminalSurfaces.lifecycle.created
            ? "settled"
            : "starting";
        })
        .toBe("settled");

      const afterCreate = await getPerformanceSnapshot(page);
      const afterCreateNativeViews = await getNativeViewSnapshot(page);
      const createdDuringScenario = getOperationCount(afterCreate, "terminal.createSurface");
      const destroyedDuringScenario = getOperationCount(afterCreate, "terminal.destroySurface");

      // React batches the tab setup before mounting the active pane, so each
      // terminal gets one client surface when first visited.
      expect(createdDuringScenario).toBe(TERMINAL_COUNT);
      expect(destroyedDuringScenario).toBe(
        INITIAL_WORKSPACE_SURFACE_COUNT +
          createdDuringScenario -
          (INACTIVE_MANAGED_SURFACE_BUDGET + 1),
      );
      expect(getOperationCount(afterCreate, "terminal.setVisibleSurfaces")).toBeGreaterThanOrEqual(
        TERMINAL_COUNT,
      );
      expect(afterCreate.terminalSurfaces.lifecycle.ready).toBe(
        afterCreate.terminalSurfaces.lifecycle.created,
      );
      expect(afterCreate.terminalSurfaces.lifecycle.removed).toBe(0);
      expect(afterCreateNativeViews.visible.total).toBeLessThanOrEqual(1);

      await page.evaluate((workspaceId) => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
        if (!store) {
          throw new Error("Store not available — __DEVSPACE_STORE__ missing");
        }

        const state = (store as { getState: () => Record<string, unknown> }).getState();
        (state.setActiveWorkspace as (id: string) => void)(workspaceId);
      }, scenario.baselineWorkspaceId);

      await page.waitForTimeout(500);

      const afterHide = await getPerformanceSnapshot(page);
      const afterHideNativeViews = await getNativeViewSnapshot(page);
      const destroyedOnWorkspaceSwitch =
        getOperationCount(afterHide, "terminal.destroySurface") -
        getOperationCount(afterCreate, "terminal.destroySurface");
      const retainedHiddenSurfaces =
        INITIAL_WORKSPACE_SURFACE_COUNT +
        getOperationCount(afterHide, "terminal.createSurface") -
        getOperationCount(afterHide, "terminal.destroySurface") -
        1; // the reactivated baseline workspace surface

      expect(destroyedOnWorkspaceSwitch).toBe(1);
      expect(retainedHiddenSurfaces).toBe(INACTIVE_MANAGED_SURFACE_BUDGET);
      expect(afterHideNativeViews.visible.total).toBeLessThanOrEqual(1);

      await page.evaluate((workspaceId) => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__;
        if (!store) {
          throw new Error("Store not available — __DEVSPACE_STORE__ missing");
        }

        const state = (store as { getState: () => Record<string, unknown> }).getState();
        (state.removeWorkspace as (id: string) => void)(workspaceId);
      }, scenario.retentionWorkspaceId);

      await page.waitForTimeout(500);

      const afterDestroy = await getPerformanceSnapshot(page);
      const afterDestroyNativeViews = await getNativeViewSnapshot(page);
      const destroyedOnWorkspaceRemoval =
        getOperationCount(afterDestroy, "terminal.destroySurface") -
        getOperationCount(afterHide, "terminal.destroySurface");

      expect(destroyedOnWorkspaceRemoval).toBe(INACTIVE_MANAGED_SURFACE_BUDGET);

      const managedSessions = await page.evaluate(async () => {
        const api = (
          window as unknown as {
            api: {
              terminal: {
                listManagedSessions: () => Promise<
                  { sessions: Array<{ sessionId: string }> } | { error: string }
                >;
              };
            };
          }
        ).api;
        return api.terminal.listManagedSessions();
      });
      if ("error" in managedSessions) {
        throw new Error(managedSessions.error);
      }
      const liveSessionIds = new Set(managedSessions.sessions.map((session) => session.sessionId));
      expect(scenario.sessionIds.every((sessionId) => liveSessionIds.has(sessionId))).toBe(true);

      console.log(
        JSON.stringify(
          {
            terminalCount: TERMINAL_COUNT,
            retainedHiddenSurfaces,
            destroyedOnWorkspaceSwitch,
            destroyedOnWorkspaceRemoval,
            memory: {
              baselineRss: baseline.main.process.memory.rss,
              afterCreateRss: afterCreate.main.process.memory.rss,
              afterHideRss: afterHide.main.process.memory.rss,
              afterDestroyRss: afterDestroy.main.process.memory.rss,
              createMinusBaseline:
                (afterCreate.main.process.memory.rss ?? 0) -
                (baseline.main.process.memory.rss ?? 0),
              hideMinusCreate:
                (afterHide.main.process.memory.rss ?? 0) -
                (afterCreate.main.process.memory.rss ?? 0),
              destroyMinusHide:
                (afterDestroy.main.process.memory.rss ?? 0) -
                (afterHide.main.process.memory.rss ?? 0),
            },
            workingSetByType: {
              baseline: summarizeWorkingSetByType(baseline),
              afterCreate: summarizeWorkingSetByType(afterCreate),
              afterHide: summarizeWorkingSetByType(afterHide),
              afterDestroy: summarizeWorkingSetByType(afterDestroy),
            },
            operations: {
              baseline: baseline.main.operations,
              afterCreate: afterCreate.main.operations,
              afterHide: afterHide.main.operations,
              afterDestroy: afterDestroy.main.operations,
            },
            nativeViews: {
              baseline: baselineNativeViews,
              afterCreate: afterCreateNativeViews,
              afterHide: afterHideNativeViews,
              afterDestroy: afterDestroyNativeViews,
            },
          },
          null,
          2,
        ),
      );
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

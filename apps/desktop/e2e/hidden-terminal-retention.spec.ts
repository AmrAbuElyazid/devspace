import { expect, test } from "@playwright/test";
import {
  getNativeViewSnapshot,
  getPerformanceSnapshot,
  launchApp,
  resetPerformanceCounters,
} from "./helpers/app";

const TERMINAL_COUNT = 8;

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
  test("retains inactive-workspace terminal surfaces until the workspace closes", async () => {
    const { app, page } = await launchApp();

    try {
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
        const group = (nextState.paneGroups as Record<string, { tabs: Array<{ id: string }> }>)[
          groupId
        ];
        if (!group) {
          throw new Error("Retention group missing after tab creation");
        }

        return {
          baselineWorkspaceId,
          retentionWorkspaceId,
          groupId,
          tabIds: group.tabs.map((tab) => tab.id),
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

      const afterCreate = await getPerformanceSnapshot(page);
      const afterCreateNativeViews = await getNativeViewSnapshot(page);
      const createdDuringScenario =
        getOperationCount(afterCreate, "terminal.createSurface") -
        getOperationCount(baseline, "terminal.createSurface") +
        1;

      expect(createdDuringScenario).toBe(TERMINAL_COUNT);
      expect(getOperationCount(afterCreate, "terminal.setVisibleSurfaces")).toBeGreaterThanOrEqual(
        TERMINAL_COUNT,
      );
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
      const retainedHiddenSurfaces = TERMINAL_COUNT - destroyedOnWorkspaceSwitch;

      expect(destroyedOnWorkspaceSwitch).toBe(0);
      expect(retainedHiddenSurfaces).toBe(TERMINAL_COUNT);
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

      expect(destroyedOnWorkspaceRemoval).toBe(TERMINAL_COUNT);

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
                afterCreate.main.process.memory.rss - baseline.main.process.memory.rss,
              hideMinusCreate:
                afterHide.main.process.memory.rss - afterCreate.main.process.memory.rss,
              destroyMinusHide:
                afterDestroy.main.process.memory.rss - afterHide.main.process.memory.rss,
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
      await app.close();
    }
  });
});

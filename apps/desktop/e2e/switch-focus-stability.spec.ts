import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getNativeViewSnapshot, launchApp } from "./helpers/app";

/**
 * Guards against the focus feedback loop that made v0.2.0 unusable.
 *
 * Native surfaces echo a focus notification back for focus the renderer itself
 * requested. When the active tab changed between the request and the echo,
 * acting on that echo moved the selection back, which re-armed the previous
 * pane's auto-focus effect, whose echo moved it forward again. Two panes then
 * flip-flopped at IPC speed and never settled — reconcile and focus counters
 * climbed by hundreds per second with no user input.
 *
 * The gesture matters: a plain `.click()` did not reproduce it. A real
 * pointerdown → small move → pointerup arms the native-view drag shield, which
 * hides every surface and then restores them, so the outgoing tab re-requests
 * focus at the same moment the incoming tab does.
 */

const jitterClick = async (
  page: import("@playwright/test").Page,
  selector: string,
): Promise<boolean> => {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) return false;
  const box = await target.boundingBox();
  if (!box) return false;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 1, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  return true;
};

test.describe("workspace and tab switching", () => {
  test("switching settles instead of oscillating", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ds-switch-"));
    const { app, page } = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });

    try {
      // A split workspace with mixed pane types next to a second workspace —
      // the loop needs at least two retained native surfaces to bounce between.
      const ids = await page.evaluate(() => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
          getState: () => Record<string, unknown>;
        };
        const state = store.getState();
        const addWorkspace = state.addWorkspace as (
          name?: string,
          parent?: string | null,
          cwd?: string,
          defaultType?: string,
        ) => string;
        const addGroupTab = state.addGroupTab as (w: string, g: string, d?: string) => void;
        const splitGroup = state.splitGroup as (
          w: string,
          g: string,
          direction: string,
          d?: string,
        ) => string | void;

        const first = (state.workspaces as { id: string; focusedGroupId: string | null }[])[0]!;
        const secondId = addWorkspace("B", null, "main", "terminal");

        splitGroup(first.id, first.focusedGroupId!, "horizontal", "terminal");
        addGroupTab(first.id, first.focusedGroupId!, "terminal");
        addGroupTab(first.id, first.focusedGroupId!, "browser");

        const next = store.getState();
        const second = (next.workspaces as { id: string; focusedGroupId: string | null }[]).find(
          (workspace) => workspace.id === secondId,
        )!;
        addGroupTab(secondId, second.focusedGroupId!, "terminal");
        (next.setActiveWorkspace as (id: string) => void)(first.id);

        return { first: first.id, second: secondId, group: first.focusedGroupId! };
      });

      await page.waitForTimeout(3500);

      const tabIds = await page.evaluate(({ group }) => {
        const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
          getState: () => Record<string, unknown>;
        };
        const groups = store.getState().paneGroups as Record<string, { tabs: { id: string }[] }>;
        return groups[group]!.tabs.map((tab) => tab.id);
      }, ids);

      for (let index = 0; index < 5; index++) {
        const tabId = tabIds[index % tabIds.length]!;
        expect(await jitterClick(page, `[data-sortable-id="gtab-${tabId}"]`)).toBe(true);
      }

      for (let index = 0; index < 5; index++) {
        const workspaceId = index % 2 === 0 ? ids.second : ids.first;
        expect(await jitterClick(page, `[data-sortable-id="ws-${workspaceId}"]`)).toBe(true);
      }

      // With no further input the app must be completely quiet. While the loop
      // was live this window produced ~960 reconciles and ~240 focus requests.
      const before = await getNativeViewSnapshot(page);
      await page.waitForTimeout(4000);
      const after = await getNativeViewSnapshot(page);

      expect({
        reconcile: after.counters.reconcileCalls - before.counters.reconcileCalls,
        focus: after.counters.focusRequests - before.counters.focusRequests,
        register: after.counters.registerCalls - before.counters.registerCalls,
        unregister: after.counters.unregisterCalls - before.counters.unregisterCalls,
      }).toEqual({ reconcile: 0, focus: 0, register: 0, unregister: 0 });
    } finally {
      await app.close();
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupManagedTmuxSessions, launchApp } from "./helpers/app";

const PANE_COUNT = 50;

type PersistedShape = {
  paneCount: number;
  paneTypes: Record<string, number>;
  root: unknown;
  groups: Record<string, { activeTabId: string; paneIds: string[] }>;
  managedSessionIds: string[];
};

async function readShape(
  page: Awaited<ReturnType<typeof launchApp>>["page"],
): Promise<PersistedShape> {
  return page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as
      | { getState: () => Record<string, unknown> }
      | undefined;
    if (!store) throw new Error("Store not available");
    const state = store.getState();
    const panes = state.panes as Record<
      string,
      { type: string; config: { backend?: string; sessionId?: string } }
    >;
    const workspace = (state.workspaces as Array<{ id: string; root: unknown }>).find(
      (candidate) => candidate.id === state.activeWorkspaceId,
    );
    if (!workspace) throw new Error("Active workspace not found");
    const paneTypes: Record<string, number> = {};
    for (const pane of Object.values(panes)) paneTypes[pane.type] = (paneTypes[pane.type] ?? 0) + 1;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serializes this callback, so helpers must stay self-contained.
    const normalizeRoot = (value: unknown): unknown => {
      const node = value as {
        type?: string;
        groupId?: string;
        direction?: string;
        sizes?: number[];
        children?: unknown[];
      };
      if (node.type === "leaf") return { type: "leaf", groupId: node.groupId };
      const sizes = node.sizes ?? [];
      const total = sizes.reduce((sum, size) => sum + size, 0);
      return {
        type: "branch",
        direction: node.direction,
        sizes: sizes.map((size) => (total > 0 ? Number((size / total).toFixed(6)) : 0)),
        children: (node.children ?? []).map(normalizeRoot),
      };
    };

    return {
      paneCount: Object.keys(panes).length,
      paneTypes,
      root: normalizeRoot(workspace.root),
      groups: Object.fromEntries(
        Object.entries(
          state.paneGroups as Record<
            string,
            { activeTabId: string; tabs: Array<{ paneId: string }> }
          >,
        ).map(([id, group]) => [
          id,
          { activeTabId: group.activeTabId, paneIds: group.tabs.map((tab) => tab.paneId) },
        ]),
      ),
      managedSessionIds: Object.values(panes).flatMap((pane) =>
        pane.type === "terminal" && pane.config.backend === "managed-tmux" && pane.config.sessionId
          ? [pane.config.sessionId]
          : [],
      ),
    };
  });
}

test("50 mixed panes preserve reorder and split topology across renderer restart", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "ds-persist-"));
  const { app, page } = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataPath } });
  try {
    await page.evaluate((paneCount) => {
      const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as
        | { getState: () => Record<string, unknown> }
        | undefined;
      if (!store) throw new Error("Store not available");
      const state = store.getState();
      const workspace = (
        state.workspaces as Array<{ id: string; focusedGroupId: string | null }>
      ).find((candidate) => candidate.id === state.activeWorkspaceId);
      if (!workspace?.focusedGroupId) throw new Error("Focused group not found");
      const workspaceId = workspace.id;
      const groupId = workspace.focusedGroupId;
      const paneTypes = ["browser", "note", "terminal", "editor", "t3code"];
      const addGroupTab = state.addGroupTab as (
        workspaceId: string,
        groupId: string,
        type: string,
      ) => void;

      for (let index = 1; index < paneCount; index++) {
        addGroupTab(workspaceId, groupId, paneTypes[index % paneTypes.length]!);
      }

      let next = store.getState();
      (
        next.reorderGroupTabs as (
          workspaceId: string,
          groupId: string,
          fromIndex: number,
          toIndex: number,
        ) => void
      )(workspaceId, groupId, 0, paneCount - 1);
      next = store.getState();
      (
        next.reorderGroupTabs as (
          workspaceId: string,
          groupId: string,
          fromIndex: number,
          toIndex: number,
        ) => void
      )(workspaceId, groupId, 10, 2);

      next = store.getState();
      const group = (
        next.paneGroups as Record<string, { tabs: Array<{ id: string; paneId: string }> }>
      )[groupId];
      const panes = next.panes as Record<string, { type: string }>;
      const splitTab = group?.tabs.find((tab) => panes[tab.paneId]?.type === "browser");
      if (!splitTab) throw new Error("Browser tab for split not found");
      (
        next.splitGroupWithTab as (
          workspaceId: string,
          sourceGroupId: string,
          tabId: string,
          targetGroupId: string,
          side: "right",
        ) => void
      )(workspaceId, groupId, splitTab.id, groupId, "right");
    }, PANE_COUNT);

    await page.waitForTimeout(1_000);
    const beforeRestart = await readShape(page);
    expect(beforeRestart.paneCount).toBe(PANE_COUNT);
    expect(Object.keys(beforeRestart.paneTypes).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(beforeRestart.groups)).toHaveLength(2);

    await page.reload();
    await page.waitForSelector(".app-shell", { timeout: 30_000 });

    const afterRestart = await readShape(page);
    expect(afterRestart).toEqual(beforeRestart);
  } finally {
    try {
      await cleanupManagedTmuxSessions(page);
    } finally {
      await app.close();
    }
    await rm(userDataPath, { recursive: true, force: true });
  }
});

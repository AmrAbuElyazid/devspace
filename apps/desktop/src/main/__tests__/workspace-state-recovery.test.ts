import { afterAll, expect, test, vi } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DatabaseSync } from "node:sqlite";
import {
  callRegisteredHandler,
  createElectronIpcMock,
  createIpcHandlerRegistry,
} from "./test-utils/mock-electron-ipc";

// The persistence store is a module singleton that keeps its SQLite connection
// open for the life of the process. This file gets its own data directory and
// never wipes it between tests, so the database the store writes through is
// still reachable on disk when the test opens a second connection to corrupt
// it. (workspace-state-ipc.test.ts wipes its directory per test, which unlinks
// the file out from under that still-open connection.)
const handlers = createIpcHandlerRegistry();
const workspaceDataPath = join(tmpdir(), `devspace-workspace-recovery-${process.pid}`);

vi.mock("electron", () =>
  createElectronIpcMock(handlers, {
    app: {
      getPath: () => workspaceDataPath,
    },
  }),
);

const { registerWorkspaceStateIpc } = await import("../ipc/workspace-state");
registerWorkspaceStateIpc();

afterAll(async () => {
  await rm(workspaceDataPath, { recursive: true, force: true });
});

test("workspaceState recovers persistence after loading a graph-invalid baseline", async () => {
  const snapshot = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  };
  await callRegisteredHandler(handlers, "workspaceState:save", snapshot);

  // Corrupt the stored graph behind the store's back: the surviving tab now
  // references a pane that no longer exists.
  const db = new DatabaseSync(join(workspaceDataPath, "workspace-state.sqlite"));
  db.exec("DELETE FROM panes WHERE id = 'pane-1'");
  db.close();

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).rejects.toThrow(
    "Invalid persisted workspace state",
  );

  // The renderer starts fresh after that throw. Patches must not keep failing
  // against the baseline that was just rejected.
  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: {
        upsert: [{ id: "pane-2", title: "Terminal", type: "terminal", config: {} }],
        removeIds: [],
      },
    }),
  ).resolves.toEqual({ needsFullSave: true });

  const replacement = {
    ...snapshot,
    workspaces: [{ ...snapshot.workspaces[0]!, name: "Fresh" }],
  };
  await callRegisteredHandler(handlers, "workspaceState:save", replacement);

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual(
    replacement,
  );
});

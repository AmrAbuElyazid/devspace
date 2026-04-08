import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { WorkspacePersistenceStore } from "./workspace-persistence-store";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("workspace persistence store saves and reloads a snapshot", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "devspace-workspace-db-"));
  tempDirs.push(userDataPath);

  const store = new WorkspacePersistenceStore(userDataPath);
  const snapshot: PersistedWorkspaceState = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Persisted Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 123,
        lastTerminalCwd: "/tmp/project",
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Shell",
        type: "terminal",
        config: { cwd: "/tmp/project" },
      },
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

  await store.save(snapshot);

  await expect(store.load()).resolves.toEqual(snapshot);
});

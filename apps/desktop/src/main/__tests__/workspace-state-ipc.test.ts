import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  callRegisteredHandler,
  createElectronIpcMock,
  createIpcHandlerRegistry,
} from "./test-utils/mock-electron-ipc";

const handlers = createIpcHandlerRegistry();
const workspaceDataPath = join(tmpdir(), `devspace-workspace-ipc-${process.pid}`);

vi.mock("electron", () =>
  createElectronIpcMock(handlers, {
    app: {
      getPath: () => workspaceDataPath,
    },
  }),
);

const { registerWorkspaceStateIpc } = await import("../ipc/workspace-state");
registerWorkspaceStateIpc();

beforeEach(async () => {
  await rm(workspaceDataPath, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(workspaceDataPath, { recursive: true, force: true });
});

test("workspaceState IPC saves and reloads a persisted snapshot", async () => {
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
      "pane-1": {
        id: "pane-1",
        title: "Terminal",
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

  await callRegisteredHandler(handlers, "workspaceState:save", snapshot);

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual(snapshot);
});

test.each(["terminal", "browser", "editor", "t3code", "note"] as const)(
  "workspaceState IPC accepts the renderer default config for a %s pane",
  async (type) => {
    const defaultConfigs = {
      terminal: {},
      browser: { url: "about:blank" },
      editor: {},
      t3code: {},
      note: { noteId: "note-1" },
    };
    const pane = {
      id: "pane-1",
      type,
      title: type,
      config: defaultConfigs[type],
    };
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
      panes: { [pane.id]: pane },
      paneGroups: {
        "group-1": {
          id: "group-1",
          activeTabId: "tab-1",
          tabs: [{ id: "tab-1", paneId: pane.id }],
        },
      },
      pinnedSidebarNodes: [],
      sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
    };

    await expect(
      callRegisteredHandler(handlers, "workspaceState:save", snapshot),
    ).resolves.toBeUndefined();
    await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual(snapshot);
  },
);

test("workspaceState IPC accepts managed and external tmux terminal metadata", async () => {
  for (const config of [
    { backend: "managed-tmux", sessionId: "session-1", cwd: "/tmp/project" },
    { backend: "external-tmux", sessionName: "work", socketPath: "/tmp/user-tmux.sock" },
  ]) {
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
        "pane-1": {
          id: "pane-1",
          title: "Terminal",
          type: "terminal",
          config,
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

    await expect(
      callRegisteredHandler(handlers, "workspaceState:save", snapshot),
    ).resolves.toBeUndefined();
  }
});

test("workspaceState async save rejects invalid payloads", async () => {
  await expect(
    callRegisteredHandler(handlers, "workspaceState:save", { nope: true }),
  ).rejects.toThrow("Invalid workspace state");
});

test("workspaceState patch updates only the supplied entities", async () => {
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

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: {
        upsert: [{ ...snapshot.panes["pane-1"], title: "Renamed Terminal" }],
        removeIds: [],
      },
    }),
  ).resolves.toEqual({ ok: true });

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual({
    ...snapshot,
    panes: {
      "pane-1": { ...snapshot.panes["pane-1"], title: "Renamed Terminal" },
    },
  });
});

test("workspaceState patch rejects malformed and graph-breaking deltas", async () => {
  await callRegisteredHandler(handlers, "workspaceState:save", {
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
  });

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: { upsert: [], removeIds: "pane-1" },
    }),
  ).rejects.toThrow("Invalid workspace state patch");

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: { upsert: [], removeIds: ["pane-1"] },
    }),
  ).rejects.toThrow("Invalid workspace state patch result");
});

test("workspaceState patch requires orderedIds to contain every surviving workspace", async () => {
  await callRegisteredHandler(handlers, "workspaceState:save", {
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
      {
        id: "workspace-2",
        name: "Workspace 2",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 2,
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
  });

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      workspaces: { upsert: [], removeIds: [], orderedIds: ["workspace-1"] },
    }),
  ).rejects.toThrow("Invalid workspace ordering patch");
});

test("workspaceState async save rejects graph-inconsistent payloads", async () => {
  const snapshot = {
    activeWorkspaceId: "missing-workspace",
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
    sidebarTree: [],
  };

  await expect(callRegisteredHandler(handlers, "workspaceState:save", snapshot)).rejects.toThrow(
    "Invalid workspace state",
  );
});

test("workspaceState async save rejects oversized payloads", async () => {
  const snapshot = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "x".repeat(5 * 1024 * 1024),
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
    sidebarTree: [],
  };

  await expect(callRegisteredHandler(handlers, "workspaceState:save", snapshot)).rejects.toThrow(
    "Invalid workspace state",
  );
});

test("workspaceState sync save reports invalid payloads without writing", () => {
  const handler = handlers.get("workspaceState:saveSync");
  if (!handler) {
    throw new Error("Expected workspaceState:saveSync handler to be registered");
  }

  const event = { returnValue: undefined };
  handler(event, { nope: true });

  expect(event.returnValue).toEqual({ ok: false, error: "Invalid workspace state" });
});

/** Snapshot with one editor pane whose config carries `extraConfig`. */
function snapshotWithEditorConfig(extraConfig: Record<string, unknown>) {
  return {
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
      "pane-1": {
        id: "pane-1",
        title: "VC: project",
        type: "editor",
        config: { folderPath: "/tmp/project", ...extraConfig },
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
}

const TOKENED_EDITOR_URL =
  "http://127.0.0.1:18562/devspace-vscode?tkn=super-secret-token&folder=%2Ftmp%2Fproject";

test("a saved editor pane keeps its folder and loses everything else", async () => {
  // A VS Code pane's URL carries its connection token. Pane config is written
  // verbatim, so this is the backstop that keeps a live credential out of the
  // state file even if a caller hands one over.
  await callRegisteredHandler(
    handlers,
    "workspaceState:save",
    snapshotWithEditorConfig({ url: TOKENED_EDITOR_URL }),
  );

  const loaded = (await callRegisteredHandler(handlers, "workspaceState:load")) as {
    panes: Record<string, { config: Record<string, unknown> }>;
  };

  expect(loaded.panes["pane-1"]?.config).toEqual({ folderPath: "/tmp/project" });
  expect(JSON.stringify(loaded)).not.toContain("super-secret-token");
});

test("a patched editor pane loses config keys it does not persist", async () => {
  await callRegisteredHandler(handlers, "workspaceState:save", snapshotWithEditorConfig({}));

  await callRegisteredHandler(handlers, "workspaceState:patch", {
    panes: {
      upsert: [
        {
          id: "pane-1",
          title: "VC: project",
          type: "editor",
          config: { folderPath: "/tmp/project", url: TOKENED_EDITOR_URL },
        },
      ],
      removeIds: [],
    },
  });

  const loaded = (await callRegisteredHandler(handlers, "workspaceState:load")) as {
    panes: Record<string, { config: Record<string, unknown> }>;
  };

  expect(loaded.panes["pane-1"]?.config).toEqual({ folderPath: "/tmp/project" });
  expect(JSON.stringify(loaded)).not.toContain("super-secret-token");
});

test("a browser pane keeps the config keys it is supposed to persist", async () => {
  const snapshot = snapshotWithEditorConfig({});
  snapshot.panes["pane-1"] = {
    id: "pane-1",
    title: "Example",
    type: "browser",
    config: {
      url: "https://example.com/",
      zoom: 1.25,
      faviconUrl: "https://example.com/favicon.ico",
      viewport: { kind: "device", width: 390, height: 844 },
    },
  } as never;

  await callRegisteredHandler(handlers, "workspaceState:save", snapshot);

  const loaded = (await callRegisteredHandler(handlers, "workspaceState:load")) as {
    panes: Record<string, { config: Record<string, unknown> }>;
  };

  expect(loaded.panes["pane-1"]?.config).toEqual({
    url: "https://example.com/",
    zoom: 1.25,
    faviconUrl: "https://example.com/favicon.ico",
    viewport: { kind: "device", width: 390, height: 844 },
  });
});

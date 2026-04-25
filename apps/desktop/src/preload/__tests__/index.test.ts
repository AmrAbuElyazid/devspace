import { expect, test, vi } from "vitest";
import type { DevspaceBridge } from "../../shared/types";

const invokeCalls: unknown[][] = [];
const syncCalls: unknown[][] = [];
const sendCalls: unknown[][] = [];
const listenerRegistrations: Array<["on" | "removeListener", string]> = [];
const listenerCallbacks = new Map<string, (...args: unknown[]) => void>();
let exposedBridge: DevspaceBridge | undefined;

vi.mock("../electron-bridge", () => ({
  getElectronBridge: () => ({
    contextBridge: {
      exposeInMainWorld: (_key: string, bridge: DevspaceBridge) => {
        exposedBridge = bridge;
      },
    },
    ipcRenderer: {
      invoke: (...args: unknown[]) => {
        invokeCalls.push(args);
        return Promise.resolve(undefined);
      },
      sendSync: (...args: unknown[]) => {
        syncCalls.push(args);
        return undefined;
      },
      send: (...args: unknown[]) => {
        sendCalls.push(args);
      },
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        listenerRegistrations.push(["on", channel]);
        listenerCallbacks.set(channel, listener);
      },
      removeListener: (channel: string) => {
        listenerRegistrations.push(["removeListener", channel]);
      },
    },
  }),
}));

test("preload bridge exposes spec-aligned browser and editor IPC methods", async () => {
  await import("../index");

  const bridge = exposedBridge;
  expect((bridge as Record<string, unknown> | undefined)?.["fs"]).toBeUndefined();
  expect(bridge).toBeDefined();

  if (!bridge) {
    throw new Error("Expected preload bridge to be exposed");
  }

  await bridge.app.getPerformanceSnapshot();
  await bridge.app.resetPerformanceCounters();
  await bridge.app.getUpdateState();
  await bridge.app.checkForUpdates();
  await bridge.app.installUpdate();
  bridge.window.setThemeMode("dark");
  await bridge.window.isFullScreen();
  await bridge.editor.isAvailable("code-insiders");
  await bridge.editor.getCliStatus("code-insiders");
  await bridge.editor.start("editor-pane", "/tmp/project", "/custom/code");
  await bridge.browser.show("pane-1");
  await bridge.browser.hide("pane-1");
  await bridge.browser.getRuntimeState("pane-1");
  await bridge.browser.navigate("pane-1", "https://example.com");
  await bridge.browser.back("pane-1");
  await bridge.browser.forward("pane-1");
  await bridge.browser.toggleDevTools("pane-1");
  await bridge.browser.resetZoom("pane-1");
  await bridge.browser.showContextMenu("pane-1", { x: 10, y: 20 });
  await bridge.browser.resolvePermission("token-1", "allow-for-session");
  await bridge.browser.importBrowser("chrome", "/tmp/Profile 1", "history");
  await bridge.browser.importBrowser("safari", null, "cookies");
  await bridge.browser.clearBrowsingData("everything");
  await bridge.notes.read("note-1");
  await bridge.notes.save("note-1", "# Hello");
  bridge.notes.saveSync("note-1", "# Hello");
  await bridge.notes.list();
  await bridge.workspaceState.load();
  await bridge.workspaceState.save({
    activeWorkspaceId: "workspace-1",
    paneGroups: {},
    panes: {},
    pinnedSidebarNodes: [],
    sidebarTree: [],
    workspaces: [],
  });
  bridge.workspaceState.saveSync({
    activeWorkspaceId: "workspace-1",
    paneGroups: {},
    panes: {},
    pinnedSidebarNodes: [],
    sidebarTree: [],
    workspaces: [],
  });
  const unsubscribeFullScreen = bridge.window.onFullScreenChange(() => {});
  const unsubscribeNativeModifier = bridge.window.onNativeModifierChanged(() => {});
  const unsubscribeUpdateState = bridge.app.onUpdateStateChanged(() => {});
  const unsubscribeState = bridge.browser.onStateChange(() => {});
  const unsubscribeFocused = bridge.browser.onFocused(() => {});
  const unsubscribePermission = bridge.browser.onPermissionRequest(() => {});
  const unsubscribeContextMenu = bridge.browser.onContextMenuRequest(() => {});
  const unsubscribeOpenInNewTab = bridge.browser.onOpenInNewTabRequest(() => {});
  unsubscribeFullScreen();
  unsubscribeNativeModifier();
  unsubscribeUpdateState();
  unsubscribeState();
  unsubscribeFocused();
  unsubscribePermission();
  unsubscribeContextMenu();
  unsubscribeOpenInNewTab();

  expect(invokeCalls).toEqual([
    ["app:getPerformanceSnapshot"],
    ["app:resetPerformanceCounters"],
    ["app:getUpdateState"],
    ["app:checkForUpdates"],
    ["app:installUpdate"],
    ["window:isFullScreen"],
    ["editor:isAvailable", "code-insiders"],
    ["editor:getCliStatus", "code-insiders"],
    ["editor:start", "editor-pane", "/tmp/project", "/custom/code"],
    ["browser:show", "pane-1"],
    ["browser:hide", "pane-1"],
    ["browser:getRuntimeState", "pane-1"],
    ["browser:navigate", "pane-1", "https://example.com"],
    ["browser:back", "pane-1"],
    ["browser:forward", "pane-1"],
    ["browser:toggleDevTools", "pane-1"],
    ["browser:resetZoom", "pane-1"],
    ["browser:showContextMenu", "pane-1", { x: 10, y: 20 }],
    ["browser:resolvePermission", "token-1", "allow-for-session"],
    ["browser:import", "chrome", "/tmp/Profile 1", "history"],
    ["browser:import", "safari", null, "cookies"],
    ["browser:clearData", "everything"],
    ["notes:read", "note-1"],
    ["notes:save", "note-1", "# Hello"],
    ["notes:list"],
    ["workspaceState:load"],
    [
      "workspaceState:save",
      {
        activeWorkspaceId: "workspace-1",
        paneGroups: {},
        panes: {},
        pinnedSidebarNodes: [],
        sidebarTree: [],
        workspaces: [],
      },
    ],
  ]);

  expect(listenerRegistrations).toEqual([
    ["on", "window:fullScreenChange"],
    ["on", "window:nativeModifierChanged"],
    ["on", "app:updateStateChanged"],
    ["on", "browser:stateChanged"],
    ["on", "browser:focused"],
    ["on", "browser:permissionRequested"],
    ["on", "browser:contextMenuRequested"],
    ["on", "browser:openInNewTabRequested"],
    ["removeListener", "window:fullScreenChange"],
    ["removeListener", "window:nativeModifierChanged"],
    ["removeListener", "app:updateStateChanged"],
    ["removeListener", "browser:stateChanged"],
    ["removeListener", "browser:focused"],
    ["removeListener", "browser:permissionRequested"],
    ["removeListener", "browser:contextMenuRequested"],
    ["removeListener", "browser:openInNewTabRequested"],
  ]);

  expect(syncCalls).toEqual([
    ["notes:saveSync", "note-1", "# Hello"],
    [
      "workspaceState:saveSync",
      {
        activeWorkspaceId: "workspace-1",
        paneGroups: {},
        panes: {},
        pinnedSidebarNodes: [],
        sidebarTree: [],
        workspaces: [],
      },
    ],
  ]);

  expect(sendCalls).toEqual([["window:setThemeMode", "dark"]]);
});

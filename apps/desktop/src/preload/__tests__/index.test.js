import { expect, vi, test } from "vitest";

const invokeCalls = [];
const listenerRegistrations = [];
const listenerCallbacks = new Map();
let exposedBridge;

vi.mock("../electron-bridge", () => ({
  getElectronBridge: () => ({
    contextBridge: {
      exposeInMainWorld: (_key, bridge) => {
        exposedBridge = bridge;
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invokeCalls.push(args);
        return Promise.resolve(undefined);
      },
      send: () => {},
      on: (channel, listener) => {
        listenerRegistrations.push(["on", channel]);
        listenerCallbacks.set(channel, listener);
      },
      removeListener: (channel) => {
        listenerRegistrations.push(["removeListener", channel]);
      },
    },
  }),
}));

test("preload bridge exposes spec-aligned browser and editor IPC methods", async () => {
  await import("../index");

  expect(exposedBridge.fs).toBeUndefined();

  await exposedBridge.editor.isAvailable("code-insiders");
  await exposedBridge.editor.start("editor-pane", "/tmp/project", "/custom/code");
  await exposedBridge.browser.show("pane-1");
  await exposedBridge.browser.hide("pane-1");
  await exposedBridge.browser.getRuntimeState("pane-1");
  await exposedBridge.browser.navigate("pane-1", "https://example.com");
  await exposedBridge.browser.back("pane-1");
  await exposedBridge.browser.forward("pane-1");
  await exposedBridge.browser.toggleDevTools("pane-1");
  await exposedBridge.browser.resetZoom("pane-1");
  await exposedBridge.browser.showContextMenu("pane-1", { x: 10, y: 20 });
  await exposedBridge.browser.resolvePermission("token-1", "allow-for-session");
  await exposedBridge.browser.importBrowser("chrome", "/tmp/Profile 1", "history");
  await exposedBridge.browser.importBrowser("safari", null, "cookies");
  await exposedBridge.browser.clearBrowsingData("everything");
  const unsubscribeNativeModifier = exposedBridge.window.onNativeModifierChanged(() => {});
  const unsubscribeState = exposedBridge.browser.onStateChange(() => {});
  const unsubscribeFocused = exposedBridge.browser.onFocused(() => {});
  const unsubscribePermission = exposedBridge.browser.onPermissionRequest(() => {});
  const unsubscribeContextMenu = exposedBridge.browser.onContextMenuRequest(() => {});
  const unsubscribeOpenInNewTab = exposedBridge.browser.onOpenInNewTabRequest(() => {});
  unsubscribeNativeModifier();
  unsubscribeState();
  unsubscribeFocused();
  unsubscribePermission();
  unsubscribeContextMenu();
  unsubscribeOpenInNewTab();

  expect(invokeCalls).toEqual([
    ["editor:isAvailable", "code-insiders"],
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
  ]);

  expect(listenerRegistrations).toEqual([
    ["on", "window:nativeModifierChanged"],
    ["on", "browser:stateChanged"],
    ["on", "browser:focused"],
    ["on", "browser:permissionRequested"],
    ["on", "browser:contextMenuRequested"],
    ["on", "browser:openInNewTabRequested"],
    ["removeListener", "window:nativeModifierChanged"],
    ["removeListener", "browser:stateChanged"],
    ["removeListener", "browser:focused"],
    ["removeListener", "browser:permissionRequested"],
    ["removeListener", "browser:contextMenuRequested"],
    ["removeListener", "browser:openInNewTabRequested"],
  ]);
});

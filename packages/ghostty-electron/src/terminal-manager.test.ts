import { beforeEach, expect, test, vi } from "vitest";
import { GhosttyTerminal } from "./terminal-manager";
import type { GhosttyNativeBridge } from "./native";

const nativeMocks = vi.hoisted(() => {
  const bridgeCallbacks = new Map<string, (...args: unknown[]) => void>();
  const bridge: GhosttyNativeBridge = {
    init: vi.fn(),
    shutdown: vi.fn(),
    createSurface: vi.fn(),
    destroySurface: vi.fn(),
    showSurface: vi.fn(),
    hideSurface: vi.fn(),
    focusSurface: vi.fn(),
    resizeSurface: vi.fn(),
    setVisibleSurfaces: vi.fn(),
    blurSurfaces: vi.fn(),
    sendBindingAction: vi.fn(() => true),
    setReservedShortcuts: vi.fn(),
    setCallback: vi.fn((event, callback) => {
      bridgeCallbacks.set(event, callback);
    }),
  };

  return {
    bridgeCallbacks,
    bridge,
    loadNativeAddon: vi.fn(() => bridge),
  };
});

vi.mock("./native", () => ({
  loadNativeAddon: nativeMocks.loadNativeAddon,
}));

beforeEach(() => {
  nativeMocks.bridgeCallbacks.clear();
  nativeMocks.loadNativeAddon.mockClear();
  for (const fn of Object.values(nativeMocks.bridge)) {
    if (typeof fn === "function" && "mockClear" in fn) {
      (fn as ReturnType<typeof vi.fn>).mockClear();
    }
  }
});

test("init loads the addon, initializes the bridge, and forwards valid events", () => {
  const terminal = new GhosttyTerminal();
  const onTitleChanged = vi.fn();
  const onModifierChanged = vi.fn();
  const onNotification = vi.fn();

  terminal.on("title-changed", onTitleChanged);
  terminal.on("modifier-changed", onModifierChanged);
  terminal.on("notification", onNotification);

  const windowHandle = Buffer.from("window-handle");
  terminal.init({
    windowHandle,
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });

  expect(nativeMocks.loadNativeAddon).toHaveBeenCalledWith("/tmp/ghostty_bridge.node");
  expect(nativeMocks.bridge.init).toHaveBeenCalledWith(windowHandle);

  nativeMocks.bridgeCallbacks.get("title-changed")?.("surface-1", "Shell");
  nativeMocks.bridgeCallbacks.get("modifier-changed")?.("command");
  nativeMocks.bridgeCallbacks.get("modifier-changed")?.(null);
  nativeMocks.bridgeCallbacks.get("notification")?.("surface-1", "Build", "Done");
  nativeMocks.bridgeCallbacks.get("title-changed")?.("surface-1", 42);

  expect(onTitleChanged).toHaveBeenCalledWith("surface-1", "Shell");
  expect(onModifierChanged).toHaveBeenCalledWith("command");
  expect(onModifierChanged).toHaveBeenCalledWith(null);
  expect(onNotification).toHaveBeenCalledWith("surface-1", "Build", "Done");
  expect(onTitleChanged).toHaveBeenCalledTimes(1);
});

test("surface lifecycle methods forward to the bridge and closed callbacks retire surfaces", () => {
  const terminal = new GhosttyTerminal();
  const onClosed = vi.fn();

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });
  terminal.on("surface-closed", onClosed);

  terminal.createSurface("surface-1", { cwd: "/tmp/project" });
  terminal.createSurface("surface-2");
  terminal.focusSurface("surface-1");
  terminal.setBounds("surface-1", { x: 1, y: 2, width: 300, height: 160 });
  terminal.setVisibleSurfaces(["surface-1"]);
  terminal.blurSurfaces();
  terminal.setReservedShortcuts([
    { key: "K", command: true, shift: false, option: false, control: false },
  ]);

  expect(nativeMocks.bridge.createSurface).toHaveBeenCalledWith("surface-1", {
    cwd: "/tmp/project",
  });
  expect(nativeMocks.bridge.focusSurface).toHaveBeenCalledWith("surface-1");
  expect(nativeMocks.bridge.resizeSurface).toHaveBeenCalledWith("surface-1", 1, 2, 300, 160);
  expect(nativeMocks.bridge.setVisibleSurfaces).toHaveBeenCalledWith(["surface-1"]);
  expect(nativeMocks.bridge.blurSurfaces).toHaveBeenCalledTimes(1);
  expect(nativeMocks.bridge.setReservedShortcuts).toHaveBeenCalledTimes(1);

  nativeMocks.bridgeCallbacks.get("surface-closed")?.("surface-1");

  expect(onClosed).toHaveBeenCalledWith("surface-1");
  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledWith("surface-1");

  terminal.destroy();

  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledTimes(2);
  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledWith("surface-2");
  expect(nativeMocks.bridge.shutdown).toHaveBeenCalledTimes(1);
});

test("late surface-closed callbacks do not double-destroy or re-emit retired surfaces", () => {
  const terminal = new GhosttyTerminal();
  const onClosed = vi.fn();

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });
  terminal.on("surface-closed", onClosed);

  terminal.createSurface("surface-1");
  terminal.destroySurface("surface-1");
  nativeMocks.bridgeCallbacks.get("surface-closed")?.("surface-1");

  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledTimes(1);
  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledWith("surface-1");
  expect(onClosed).not.toHaveBeenCalled();
});

test("destroy clears listeners and active surfaces before late native callbacks", () => {
  const terminal = new GhosttyTerminal();
  const onClosed = vi.fn();
  const onTitleChanged = vi.fn();

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });
  terminal.on("surface-closed", onClosed);
  terminal.on("title-changed", onTitleChanged);

  terminal.createSurface("surface-1");
  terminal.destroy();

  nativeMocks.bridgeCallbacks.get("surface-closed")?.("surface-1");
  nativeMocks.bridgeCallbacks.get("title-changed")?.("surface-1", "Shell");

  expect(nativeMocks.bridge.destroySurface).toHaveBeenCalledTimes(1);
  expect(nativeMocks.bridge.shutdown).toHaveBeenCalledTimes(1);
  expect(onClosed).not.toHaveBeenCalled();
  expect(onTitleChanged).not.toHaveBeenCalled();
});

test("emit isolates listener failures", () => {
  const terminal = new GhosttyTerminal();
  const badListener = vi.fn(() => {
    throw new Error("boom");
  });
  const goodListener = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });
  terminal.on("title-changed", badListener);
  terminal.on("title-changed", goodListener);

  nativeMocks.bridgeCallbacks.get("title-changed")?.("surface-1", "Shell");

  expect(badListener).toHaveBeenCalledTimes(1);
  expect(goodListener).toHaveBeenCalledWith("surface-1", "Shell");
  expect(consoleError).toHaveBeenCalledTimes(1);

  consoleError.mockRestore();
});

test("createSurface only tracks surfaces after native creation succeeds", () => {
  const terminal = new GhosttyTerminal();

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });

  (nativeMocks.bridge.createSurface as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
    throw new Error("native create failed");
  });

  expect(() => terminal.createSurface("surface-1")).toThrow("native create failed");

  terminal.destroy();

  expect(nativeMocks.bridge.destroySurface).not.toHaveBeenCalled();
  expect(nativeMocks.bridge.shutdown).toHaveBeenCalledTimes(1);
});

test("sendBindingAction returns false before init and bridge result after init", () => {
  const terminal = new GhosttyTerminal();

  expect(terminal.sendBindingAction("surface-1", "end_search")).toBe(false);

  terminal.init({
    windowHandle: Buffer.from("window-handle"),
    nativeAddonPath: "/tmp/ghostty_bridge.node",
  });

  expect(terminal.sendBindingAction("surface-1", "end_search")).toBe(true);
  expect(nativeMocks.bridge.sendBindingAction).toHaveBeenCalledWith("surface-1", "end_search");
});

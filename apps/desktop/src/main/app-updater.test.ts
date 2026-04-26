import { describe, expect, it, vi } from "vitest";
import { AppUpdater } from "./app-updater";

function createFakeUpdater() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();

  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    allowDowngrade: false,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (...args: any[]) => void) => {
      const handlers = listeners.get(event) ?? [];
      handlers.push(listener);
      listeners.set(event, handlers);
    }),
    emit(event: string, ...args: any[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
}

function createTimerHandle() {
  return { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
}

describe("AppUpdater", () => {
  it("disables updates in unpackaged development builds", async () => {
    const updater = createFakeUpdater();
    const appUpdater = new AppUpdater({
      isDevelopment: true,
      getWindow: () => null,
      dependencies: {
        app: {
          getVersion: () => "0.1.0",
          isPackaged: false,
        },
        updater: updater as never,
        existsSync: () => false,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
      },
    });

    appUpdater.start();

    expect(appUpdater.getState()).toEqual({
      enabled: false,
      status: "disabled",
      currentVersion: "0.1.0",
      availableVersion: null,
      checkedAt: null,
      downloadPercent: null,
      message: null,
      disabledReason: "Automatic updates are only available in packaged production builds.",
    });
    await expect(appUpdater.checkForUpdates()).resolves.toBe(false);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("allows update checks in development when explicitly enabled", async () => {
    const updater = createFakeUpdater();
    const appUpdater = new AppUpdater({
      isDevelopment: true,
      getWindow: () => null,
      dependencies: {
        app: {
          getVersion: () => "0.1.0",
          isPackaged: false,
        },
        updater: updater as never,
        processEnv: {
          DEVSPACE_ENABLE_AUTO_UPDATE_IN_DEV: "1",
        },
        existsSync: () => false,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
      },
    });

    appUpdater.start();

    expect(appUpdater.getState()).toMatchObject({
      enabled: true,
      status: "idle",
      disabledReason: null,
    });

    await expect(appUpdater.checkForUpdates()).resolves.toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("can mock a downloaded update state in development", async () => {
    const updater = createFakeUpdater();
    const appUpdater = new AppUpdater({
      isDevelopment: true,
      getWindow: () => null,
      dependencies: {
        app: {
          getVersion: () => "0.1.0",
          isPackaged: false,
        },
        updater: updater as never,
        processEnv: {
          DEVSPACE_MOCK_UPDATE_STATE: "downloaded",
          DEVSPACE_MOCK_UPDATE_VERSION: "0.1.1",
        },
        existsSync: () => false,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
        now: () => "2026-04-26T05:30:00.000Z",
      },
    });

    appUpdater.start();

    expect(appUpdater.getState()).toEqual({
      enabled: true,
      status: "downloaded",
      currentVersion: "0.1.0",
      availableVersion: "0.1.1",
      checkedAt: "2026-04-26T05:30:00.000Z",
      downloadPercent: 100,
      message: null,
      disabledReason: null,
    });

    await expect(appUpdater.quitAndInstall()).resolves.toBe(true);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("tracks available, downloading, and downloaded update states", async () => {
    const updater = createFakeUpdater();
    const showMessageBox = vi.fn(async () => ({ response: 1 }));
    const appUpdater = new AppUpdater({
      isDevelopment: false,
      getWindow: () => ({ id: 1 }) as never,
      dependencies: {
        app: {
          getVersion: () => "1.0.0",
          isPackaged: true,
        },
        updater: updater as never,
        dialog: {
          showMessageBox,
        },
        platform: "darwin",
        resourcesPath: "/Applications/Devspace.app/Contents/Resources",
        existsSync: () => true,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
        now: () => "2026-04-11T12:00:00.000Z",
      },
    });

    appUpdater.start();
    await appUpdater.checkForUpdates();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(appUpdater.getState().status).toBe("checking");

    updater.emit("update-available", { version: "1.1.0" });
    expect(appUpdater.getState()).toMatchObject({
      status: "available",
      availableVersion: "1.1.0",
      checkedAt: "2026-04-11T12:00:00.000Z",
      downloadPercent: 0,
    });

    updater.emit("download-progress", { percent: 48.6 });
    expect(appUpdater.getState()).toMatchObject({
      status: "downloading",
      availableVersion: "1.1.0",
      downloadPercent: 48.6,
    });

    updater.emit("update-downloaded", { version: "1.1.0" });
    expect(appUpdater.getState()).toMatchObject({
      status: "downloaded",
      availableVersion: "1.1.0",
      downloadPercent: 100,
    });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });

  it("installs a downloaded update when the prompt is accepted", async () => {
    const updater = createFakeUpdater();
    const showMessageBox = vi.fn(async () => ({ response: 0 }));
    const clearTimeout = vi.fn();
    const clearInterval = vi.fn();
    const appUpdater = new AppUpdater({
      isDevelopment: false,
      getWindow: () => ({ id: 1 }) as never,
      dependencies: {
        app: {
          getVersion: () => "1.0.0",
          isPackaged: true,
        },
        updater: updater as never,
        dialog: {
          showMessageBox,
        },
        platform: "darwin",
        resourcesPath: "/Applications/Devspace.app/Contents/Resources",
        existsSync: () => true,
        setTimeout: () => createTimerHandle(),
        clearTimeout,
        setInterval: () => createTimerHandle(),
        clearInterval,
      },
    });

    appUpdater.start();
    updater.emit("update-downloaded", { version: "1.1.0" });

    await Promise.resolve();

    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(clearTimeout).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it("records check failures as error state", async () => {
    const updater = createFakeUpdater();
    updater.checkForUpdates.mockRejectedValueOnce(new Error("network unavailable"));

    const appUpdater = new AppUpdater({
      isDevelopment: false,
      getWindow: () => null,
      dependencies: {
        app: {
          getVersion: () => "1.0.0",
          isPackaged: true,
        },
        updater: updater as never,
        platform: "darwin",
        resourcesPath: "/Applications/Devspace.app/Contents/Resources",
        existsSync: () => true,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
        now: () => "2026-04-11T12:34:56.000Z",
      },
    });

    appUpdater.start();

    await expect(appUpdater.checkForUpdates()).resolves.toBe(false);
    expect(appUpdater.getState()).toMatchObject({
      status: "error",
      checkedAt: "2026-04-11T12:34:56.000Z",
      message: "network unavailable",
    });
  });

  it("disables private GitHub update checks after an auth-style feed failure", async () => {
    const updater = createFakeUpdater();
    updater.checkForUpdates.mockRejectedValueOnce(
      new Error(
        "Cannot find latest version on GitHub releases: GET https://github.com/AmrAbuElyazid/devspace/releases.atom returned 404. Please double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.",
      ),
    );

    const appUpdater = new AppUpdater({
      isDevelopment: false,
      getWindow: () => null,
      dependencies: {
        app: {
          getVersion: () => "1.0.0",
          isPackaged: true,
        },
        updater: updater as never,
        platform: "darwin",
        resourcesPath: "/Applications/Devspace.app/Contents/Resources",
        existsSync: () => true,
        setTimeout: () => createTimerHandle(),
        setInterval: () => createTimerHandle(),
        now: () => "2026-04-11T12:34:56.000Z",
      },
    });

    appUpdater.start();

    await expect(appUpdater.checkForUpdates()).resolves.toBe(false);
    expect(appUpdater.getState()).toEqual({
      enabled: false,
      status: "disabled",
      currentVersion: "1.0.0",
      availableVersion: null,
      checkedAt: "2026-04-11T12:34:56.000Z",
      downloadPercent: null,
      message: null,
      disabledReason:
        "Automatic updates aren't available for private GitHub releases in this build. Use View Releases to download the latest version manually.",
    });
  });
});

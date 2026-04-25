import { app, dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "fs";
import { join } from "path";
import type { AppUpdateState } from "../shared/types";

const AUTO_UPDATE_STARTUP_DELAY_MS = 15_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

type UpdateCheckReason = "startup" | "poll" | "manual";

type AutoUpdaterEventMap = {
  "checking-for-update": [];
  "update-available": [{ version: string }];
  "update-not-available": [];
  "download-progress": [{ percent: number }];
  "update-downloaded": [{ version: string }];
  error: [unknown];
};

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  setFeedURL: (options: { provider: "generic"; url: string }) => void;
  checkForUpdates: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on<K extends keyof AutoUpdaterEventMap>(
    event: K,
    listener: (...args: AutoUpdaterEventMap[K]) => void,
  ): void;
};

type TimerHandle = ReturnType<typeof setTimeout>;
type ScheduleTimer = (callback: () => void, delay: number) => TimerHandle;
type ClearTimer = (timer: TimerHandle) => void;

type DialogLike = {
  showMessageBox: (
    window: BrowserWindow,
    options: MessageBoxOptions,
  ) => Promise<{ response: number }>;
};

interface AppUpdaterDependencies {
  app?: Pick<typeof app, "getVersion" | "isPackaged">;
  updater?: AutoUpdaterLike;
  dialog?: DialogLike;
  existsSync?: (path: string) => boolean;
  processEnv?: NodeJS.ProcessEnv;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  setTimeout?: ScheduleTimer;
  clearTimeout?: ClearTimer;
  setInterval?: ScheduleTimer;
  clearInterval?: ClearTimer;
  now?: () => string;
}

export interface AppUpdaterLike {
  start(): void;
  getState(): AppUpdateState;
  checkForUpdates(reason?: UpdateCheckReason): Promise<boolean>;
  quitAndInstall(): Promise<boolean>;
  onStateChange(listener: (state: AppUpdateState) => void): () => void;
}

interface AppUpdaterOptions {
  isDevelopment: boolean;
  getWindow: () => BrowserWindow | null;
  dependencies?: AppUpdaterDependencies;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AppUpdater implements AppUpdaterLike {
  private readonly appApi;
  private readonly updater;
  private readonly dialogApi;
  private readonly fileExists;
  private readonly env;
  private readonly resourcesPath;
  private readonly platform;
  private readonly setTimeoutFn;
  private readonly clearTimeoutFn;
  private readonly setIntervalFn;
  private readonly clearIntervalFn;
  private readonly now;
  private readonly getWindow;
  private readonly isDevelopment;
  private readonly listeners = new Set<(state: AppUpdateState) => void>();

  private state: AppUpdateState;
  private started = false;
  private checkInFlight = false;
  private startupTimer: TimerHandle | null = null;
  private pollTimer: TimerHandle | null = null;
  private promptedVersion: string | null = null;

  constructor(options: AppUpdaterOptions) {
    this.isDevelopment = options.isDevelopment;
    this.getWindow = options.getWindow;
    this.appApi = options.dependencies?.app ?? app;
    this.updater = options.dependencies?.updater ?? (autoUpdater as unknown as AutoUpdaterLike);
    this.dialogApi = options.dependencies?.dialog ?? (dialog as unknown as DialogLike);
    this.fileExists = options.dependencies?.existsSync ?? existsSync;
    this.env = options.dependencies?.processEnv ?? process.env;
    this.resourcesPath = options.dependencies?.resourcesPath ?? process.resourcesPath ?? "";
    this.platform = options.dependencies?.platform ?? process.platform;
    this.setTimeoutFn = options.dependencies?.setTimeout ?? globalThis.setTimeout;
    this.clearTimeoutFn = options.dependencies?.clearTimeout ?? globalThis.clearTimeout;
    this.setIntervalFn = options.dependencies?.setInterval ?? globalThis.setInterval;
    this.clearIntervalFn = options.dependencies?.clearInterval ?? globalThis.clearInterval;
    this.now = options.dependencies?.now ?? (() => new Date().toISOString());
    this.state = this.createInitialState();
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!this.state.enabled) {
      return;
    }

    const feedUrl = this.env.DEVSPACE_UPDATE_FEED_URL?.trim();
    if (feedUrl) {
      this.updater.setFeedURL({ provider: "generic", url: feedUrl });
    }

    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;

    this.updater.on("checking-for-update", () => {
      console.info("[updater] Looking for updates...");
    });
    this.updater.on("update-available", (info: { version: string }) => {
      this.setState({
        ...this.state,
        status: "available",
        availableVersion: info.version,
        checkedAt: this.now(),
        downloadPercent: 0,
        message: null,
      });
      console.info(`[updater] Update available: ${info.version}`);
    });
    this.updater.on("update-not-available", () => {
      this.setState({
        ...this.state,
        status: "up-to-date",
        availableVersion: null,
        checkedAt: this.now(),
        downloadPercent: null,
        message: null,
      });
      console.info("[updater] No updates available.");
    });
    this.updater.on("download-progress", (progress: { percent: number }) => {
      this.setState({
        ...this.state,
        status: "downloading",
        downloadPercent: progress.percent,
        message: null,
      });
    });
    this.updater.on("update-downloaded", (info: { version: string }) => {
      this.setState({
        ...this.state,
        status: "downloaded",
        availableVersion: info.version,
        downloadPercent: 100,
        message: null,
      });
      console.info(`[updater] Update downloaded: ${info.version}`);
      void this.promptToInstall(info.version);
    });
    this.updater.on("error", (error: unknown) => {
      const message = formatErrorMessage(error);
      const nextStatus = this.state.availableVersion ? "available" : "error";
      this.setState({
        ...this.state,
        status: nextStatus,
        checkedAt: this.now(),
        downloadPercent: null,
        message,
      });
      console.error(`[updater] ${message}`);
    });

    this.startupTimer = this.setTimeoutFn(() => {
      this.startupTimer = null;
      void this.checkForUpdates("startup");
    }, AUTO_UPDATE_STARTUP_DELAY_MS);
    this.startupTimer.unref?.();

    this.pollTimer = this.setIntervalFn(() => {
      void this.checkForUpdates("poll");
    }, AUTO_UPDATE_POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  getState(): AppUpdateState {
    return { ...this.state };
  }

  async checkForUpdates(reason: UpdateCheckReason = "manual"): Promise<boolean> {
    if (!this.state.enabled || this.checkInFlight) {
      return false;
    }
    if (this.state.status === "downloading" || this.state.status === "downloaded") {
      return false;
    }

    this.checkInFlight = true;
    this.setState({
      ...this.state,
      status: "checking",
      checkedAt: this.now(),
      downloadPercent: null,
      message: null,
    });
    console.info(`[updater] Checking for updates (${reason})...`);

    try {
      await this.updater.checkForUpdates();
      return true;
    } catch (error) {
      const message = formatErrorMessage(error);
      this.setState({
        ...this.state,
        status: "error",
        checkedAt: this.now(),
        downloadPercent: null,
        message,
      });
      console.error(`[updater] Failed to check for updates: ${message}`);
      return false;
    } finally {
      this.checkInFlight = false;
    }
  }

  async quitAndInstall(): Promise<boolean> {
    if (!this.state.enabled || this.state.status !== "downloaded") {
      return false;
    }

    this.clearScheduledChecks();
    this.updater.quitAndInstall(true, true);
    return true;
  }

  onStateChange(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private createInitialState(): AppUpdateState {
    const disabledReason = this.resolveDisabledReason();
    return {
      enabled: disabledReason === null,
      status: disabledReason === null ? "idle" : "disabled",
      currentVersion: this.appApi.getVersion(),
      availableVersion: null,
      checkedAt: null,
      downloadPercent: null,
      message: null,
      disabledReason,
    };
  }

  private resolveDisabledReason(): string | null {
    if (this.env.DEVSPACE_DISABLE_AUTO_UPDATE === "1") {
      return "Automatic updates are disabled by DEVSPACE_DISABLE_AUTO_UPDATE.";
    }
    if (this.isDevelopment || !this.appApi.isPackaged) {
      return "Automatic updates are only available in packaged production builds.";
    }
    if (this.platform === "linux" && !this.env.APPIMAGE) {
      return "Automatic updates on Linux require the AppImage build.";
    }
    if (this.hasConfiguredFeed()) {
      return null;
    }
    return "Automatic updates are not available because no update feed is configured.";
  }

  private hasConfiguredFeed(): boolean {
    if (this.env.DEVSPACE_UPDATE_FEED_URL?.trim()) {
      return true;
    }
    if (!this.resourcesPath) {
      return false;
    }
    return this.fileExists(join(this.resourcesPath, "app-update.yml"));
  }

  private setState(nextState: AppUpdateState): void {
    this.state = nextState;
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  private clearScheduledChecks(): void {
    if (this.startupTimer) {
      this.clearTimeoutFn(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.pollTimer) {
      this.clearIntervalFn(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async promptToInstall(version: string): Promise<void> {
    if (this.promptedVersion === version) {
      return;
    }
    this.promptedVersion = version;

    const window = this.getWindow();
    if (!window) {
      return;
    }

    const result = await this.dialogApi.showMessageBox(window, {
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Devspace ${version} is ready to install.`,
      detail:
        "Restart now to apply the update. If you wait, Devspace will install it automatically the next time you quit.",
    });

    if (result.response === 0) {
      await this.quitAndInstall();
    }
  }
}

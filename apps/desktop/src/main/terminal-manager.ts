import { app, type BrowserWindow } from "electron";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { GhosttyTerminal, type ReservedShortcut, type TerminalBounds } from "ghostty-electron";
import type { TerminalCreateOptions } from "../shared/types";
import { resolveDevelopmentPath } from "./dev-paths";
import {
  buildExternalTmuxAttachCommand,
  ManagedTmuxManager,
  resolveExternalTmuxBinary,
  type ManagedTmuxSession,
} from "./managed-tmux";
import { measureMainProcessOperation } from "./performance-monitor";

function bashSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Detect the user's default shell name from SHELL env var.
 * Returns the basename (e.g. "zsh", "bash", "fish").
 */
export function detectShellName(): string {
  const shell = process.env.SHELL || "/bin/zsh";
  return shell.split("/").pop() || "zsh";
}

/**
 * Build per-surface env vars for shell integration injection.
 * Pure function — testable without native bridge.
 */
export function buildShellIntegrationEnvVars(
  shellName: string,
  dirs: {
    zshDir: string | null;
    ghosttyResourcesDir: string | null;
  },
  callerEnvVars?: Record<string, string>,
  currentEnv?: Record<string, string | undefined>,
): Record<string, string> {
  const env = currentEnv ?? process.env;
  const merged: Record<string, string> = { ...callerEnvVars };

  if (shellName === "zsh" && dirs.zshDir) {
    if (env.ZDOTDIR) {
      merged.DEVSPACE_ORIG_ZDOTDIR = env.ZDOTDIR;
    }
    merged.ZDOTDIR = dirs.zshDir;
  } else if (shellName === "bash" && dirs.ghosttyResourcesDir) {
    // One-shot PROMPT_COMMAND that sources Ghostty's bash integration
    // on the first interactive prompt, then removes itself.
    // This keeps shell integration compatible with macOS's default bash 3.2.
    const bashIntegration = `${dirs.ghosttyResourcesDir}/shell-integration/bash/ghostty.bash`;
    const quotedBashIntegration = bashSingleQuote(bashIntegration);
    merged.PROMPT_COMMAND = [
      "unset PROMPT_COMMAND;",
      `[ -f ${quotedBashIntegration} ] && . ${quotedBashIntegration};`,
    ].join(" ");
  } else if (shellName === "fish" && dirs.ghosttyResourcesDir) {
    // Fish sources vendor_conf.d/*.fish from directories in XDG_DATA_DIRS.
    // Ghostty's fish integration lives at:
    //   $GHOSTTY_RESOURCES_DIR/shell-integration/fish/vendor_conf.d/ghostty-shell-integration.fish
    // We prepend the fish integration parent dir to XDG_DATA_DIRS.
    const fishDataDir = `${dirs.ghosttyResourcesDir}/shell-integration/fish`;
    const existing = env.XDG_DATA_DIRS || "/usr/local/share:/usr/share";
    merged.XDG_DATA_DIRS = `${fishDataDir}:${existing}`;
    // The fish integration script uses this to restore XDG_DATA_DIRS after loading
    merged.GHOSTTY_SHELL_INTEGRATION_XDG_DIR = fishDataDir;
  }

  return merged;
}

type TerminalCallback = {
  onTitleChanged?: (surfaceId: string, title: string) => void;
  onSurfaceClosed?: (surfaceId: string) => void;
  onSurfaceFocused?: (surfaceId: string) => void;
  onModifierChanged?: (modifier: "command" | "control" | null) => void;
  onPwdChanged?: (surfaceId: string, pwd: string) => void;
  onNotification?: (surfaceId: string, title: string, body: string) => void;
  onSearchStart?: (surfaceId: string, needle: string) => void;
  onSearchEnd?: (surfaceId: string) => void;
  onSearchTotal?: (surfaceId: string, total: number) => void;
  onSearchSelected?: (surfaceId: string, selected: number) => void;
};

/**
 * How often managed session directories are re-read as a safety net.
 *
 * The primary trigger is a title change, which catches a `cd` almost as soon as
 * it happens. This interval only has to cover the case where the directory
 * moved but the title did not — between two directories sharing a basename — so
 * it can be slow enough to go unnoticed.
 */
const MANAGED_PATH_POLL_INTERVAL_MS = 5_000;

/** Coalesces the burst of title changes a single command can produce. */
const MANAGED_PATH_POLL_DEBOUNCE_MS = 150;

export class TerminalManager {
  private terminal: GhosttyTerminal | null = null;
  private managedTmux: ManagedTmuxManager | null = null;
  private readonly surfaceGenerations = new Map<string, number>();
  private callbacks: TerminalCallback = {};
  /** Resolved path to Devspace's ZDOTDIR wrapper for zsh shell integration. */
  private shellIntegrationZshDir: string | null = null;
  /** surfaceId → tmux session ID, for the managed panes currently attached. */
  private readonly managedSessionIds = new Map<string, string>();
  /** Last directory handed to the renderer, so unchanged ones stay quiet. */
  private readonly reportedPaths = new Map<string, string>();
  private pathPollTimer: NodeJS.Timeout | null = null;
  private pathPollDebounce: NodeJS.Timeout | null = null;
  private pathPollInFlight = false;
  private pathPollRepeat = false;
  private windowFocused = true;

  init(mainWindow: BrowserWindow): void {
    this.terminal = new GhosttyTerminal();
    const handle = mainWindow.getNativeWindowHandle();

    const nativeAddonPath = app.isPackaged
      ? resolve(
          app.getAppPath() + ".unpacked",
          "node_modules/ghostty-electron/native/build/Release/ghostty_bridge.node",
        )
      : resolveDevelopmentPath(
          "packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
          {
            appPath: app.getAppPath(),
            cwd: process.cwd(),
            moduleDir: __dirname,
          },
        );

    this.terminal.init({ windowHandle: handle, nativeAddonPath });
    const tmuxResourcesPath = app.isPackaged
      ? process.resourcesPath
      : resolveDevelopmentPath("apps/desktop/resources", {
          appPath: app.getAppPath(),
          cwd: process.cwd(),
          moduleDir: __dirname,
        });
    this.managedTmux = new ManagedTmuxManager({
      userDataPath: app.getPath("userData"),
      resourcesPath: tmuxResourcesPath,
      isPackaged: app.isPackaged,
    });

    // Resolve shell integration wrapper path (set up in index.ts).
    // Devspace's .zshenv wrapper sources Ghostty's shell integration
    // for CWD tracking, prompt marking, etc.
    if (process.env.GHOSTTY_RESOURCES_DIR) {
      const resourcesDir = process.env.GHOSTTY_RESOURCES_DIR;
      // Shell integration wrapper lives next to the ghostty resources dir
      const parentDir = join(resourcesDir, "..");
      const zshDir = join(parentDir, "devspace-shell-integration", "zsh");
      if (existsSync(join(zshDir, ".zshenv"))) {
        this.shellIntegrationZshDir = zshDir;
      }
    }

    // Polling for managed directories is pointless while the user is elsewhere.
    this.windowFocused = mainWindow.isFocused();
    mainWindow.on("focus", () => {
      this.windowFocused = true;
      this.startPathPolling();
    });
    mainWindow.on("blur", () => {
      this.windowFocused = false;
      this.stopPathPolling();
    });

    // Wire up events to callbacks
    this.terminal.on("title-changed", (surfaceId, title) => {
      this.callbacks.onTitleChanged?.(surfaceId, title);
      // A managed pane's title is derived from its current directory, so a
      // title change is the earliest hint that a `cd` happened — this is what
      // stands in for the OSC 7 that tmux swallowed.
      if (this.managedSessionIds.has(surfaceId)) this.requestManagedPathRefresh();
    });

    this.terminal.on("surface-closed", (surfaceId) => {
      this.callbacks.onSurfaceClosed?.(surfaceId);
    });

    this.terminal.on("surface-focused", (surfaceId) => {
      this.callbacks.onSurfaceFocused?.(surfaceId);
    });

    this.terminal.on("modifier-changed", (modifier) => {
      this.callbacks.onModifierChanged?.(modifier);
    });

    this.terminal.on("pwd-changed", (surfaceId, pwd) => {
      this.callbacks.onPwdChanged?.(surfaceId, pwd);
    });

    this.terminal.on("notification", (surfaceId, title, body) => {
      this.callbacks.onNotification?.(surfaceId, title, body);
    });

    this.terminal.on("search-start", (surfaceId, needle) => {
      this.callbacks.onSearchStart?.(surfaceId, needle);
    });

    this.terminal.on("search-end", (surfaceId) => {
      this.callbacks.onSearchEnd?.(surfaceId);
    });

    this.terminal.on("search-total", (surfaceId, total) => {
      this.callbacks.onSearchTotal?.(surfaceId, total);
    });

    this.terminal.on("search-selected", (surfaceId, selected) => {
      this.callbacks.onSearchSelected?.(surfaceId, selected);
    });
  }

  onTitleChanged(callback: (surfaceId: string, title: string) => void): void {
    this.callbacks.onTitleChanged = callback;
  }

  onSurfaceClosed(callback: (surfaceId: string) => void): void {
    this.callbacks.onSurfaceClosed = callback;
  }

  onSurfaceFocused(callback: (surfaceId: string) => void): void {
    this.callbacks.onSurfaceFocused = callback;
  }

  onModifierChanged(callback: (modifier: "command" | "control" | null) => void): void {
    this.callbacks.onModifierChanged = callback;
  }

  onPwdChanged(callback: (surfaceId: string, pwd: string) => void): void {
    this.callbacks.onPwdChanged = callback;
  }

  onNotification(callback: (surfaceId: string, title: string, body: string) => void): void {
    this.callbacks.onNotification = callback;
  }

  onSearchStart(callback: (surfaceId: string, needle: string) => void): void {
    this.callbacks.onSearchStart = callback;
  }

  onSearchEnd(callback: (surfaceId: string) => void): void {
    this.callbacks.onSearchEnd = callback;
  }

  onSearchTotal(callback: (surfaceId: string, total: number) => void): void {
    this.callbacks.onSearchTotal = callback;
  }

  onSearchSelected(callback: (surfaceId: string, selected: number) => void): void {
    this.callbacks.onSearchSelected = callback;
  }

  async createSurface(surfaceId: string, options?: TerminalCreateOptions): Promise<void> {
    if (!this.terminal) return;
    const generation = (this.surfaceGenerations.get(surfaceId) ?? 0) + 1;
    this.surfaceGenerations.set(surfaceId, generation);

    // Inject shell integration env vars based on user's shell (zsh, bash, fish).
    const shellName = detectShellName();
    const envVars = buildShellIntegrationEnvVars(
      shellName,
      {
        zshDir: this.shellIntegrationZshDir,
        ghosttyResourcesDir: process.env.GHOSTTY_RESOURCES_DIR || null,
      },
      options?.envVars,
    );
    const nativeOptions: {
      cwd?: string;
      envVars?: Record<string, string>;
      command?: string;
    } = {};
    if (options?.cwd) nativeOptions.cwd = options.cwd;
    if (Object.keys(envVars).length > 0) nativeOptions.envVars = envVars;

    if (options?.backend === "managed-tmux") {
      if (!this.managedTmux) {
        throw new Error("Managed terminal sessions are not initialized");
      }
      await this.managedTmux.ensureSession({
        sessionId: options.sessionId,
        envVars,
        ...(options.cwd ? { cwd: options.cwd } : {}),
      });
      nativeOptions.command = this.managedTmux.buildAttachCommand(options.sessionId);
    } else if (options?.backend === "external-tmux") {
      const binaryPath = resolveExternalTmuxBinary();
      if (!binaryPath) {
        throw new Error("Attaching to an external session requires tmux on the host PATH");
      }
      nativeOptions.command = buildExternalTmuxAttachCommand({
        binaryPath,
        sessionName: options.sessionName,
        ...(options.socketPath ? { socketPath: options.socketPath } : {}),
      });
    }

    if (this.surfaceGenerations.get(surfaceId) !== generation || !this.terminal) return;

    if (options?.backend === "managed-tmux") {
      this.managedSessionIds.set(surfaceId, options.sessionId);
      this.startPathPolling();
    }

    measureMainProcessOperation("terminal.createSurface", () => {
      this.terminal?.createSurface(
        surfaceId,
        Object.keys(nativeOptions).length > 0 ? nativeOptions : undefined,
      );
    });
  }

  async killManagedSession(sessionId: string): Promise<boolean> {
    if (!this.managedTmux) {
      throw new Error("Managed terminal sessions are not initialized");
    }
    return this.managedTmux.killSession(sessionId);
  }

  async listManagedSessions(): Promise<ManagedTmuxSession[]> {
    if (!this.managedTmux) {
      throw new Error("Managed terminal sessions are not initialized");
    }
    return this.managedTmux.listSessions();
  }

  destroySurface(surfaceId: string): void {
    if (!this.terminal) return;
    this.surfaceGenerations.set(surfaceId, (this.surfaceGenerations.get(surfaceId) ?? 0) + 1);
    // Only the Ghostty client goes away here; the tmux session deliberately
    // survives. Dropping it from the poll set just stops reporting a directory
    // nothing is displaying.
    this.managedSessionIds.delete(surfaceId);
    this.reportedPaths.delete(surfaceId);
    if (this.managedSessionIds.size === 0) this.stopPathPolling();
    measureMainProcessOperation("terminal.destroySurface", () => {
      this.terminal?.destroySurface(surfaceId);
    });
  }

  /** Re-read managed directories soon, collapsing a burst into one call. */
  private requestManagedPathRefresh(): void {
    if (this.pathPollDebounce) return;
    this.pathPollDebounce = setTimeout(() => {
      this.pathPollDebounce = null;
      void this.refreshManagedPaths();
    }, MANAGED_PATH_POLL_DEBOUNCE_MS);
    this.pathPollDebounce.unref?.();
  }

  private startPathPolling(): void {
    if (this.pathPollTimer || !this.windowFocused || this.managedSessionIds.size === 0) return;
    this.pathPollTimer = setInterval(() => {
      void this.refreshManagedPaths();
    }, MANAGED_PATH_POLL_INTERVAL_MS);
    // Background upkeep should never be the reason the process stays alive.
    this.pathPollTimer.unref?.();
    void this.refreshManagedPaths();
  }

  private stopPathPolling(): void {
    if (this.pathPollTimer) {
      clearInterval(this.pathPollTimer);
      this.pathPollTimer = null;
    }
    if (this.pathPollDebounce) {
      clearTimeout(this.pathPollDebounce);
      this.pathPollDebounce = null;
    }
  }

  /**
   * Report the current directory of every managed pane that has moved.
   *
   * This stands in for the `pwd-changed` event Ghostty raises for direct
   * terminals. Downstream nothing can tell the two apart, so directory
   * inheritance for new tabs keeps working against the same store field it
   * always has. Best effort by design: the cost of a failure is one stale
   * inherited directory, so a tmux hiccup is swallowed rather than surfaced.
   */
  private async refreshManagedPaths(): Promise<void> {
    if (!this.managedTmux || this.managedSessionIds.size === 0) return;
    if (this.pathPollInFlight) {
      this.pathPollRepeat = true;
      return;
    }

    this.pathPollInFlight = true;
    try {
      const paths = await this.managedTmux.listSessionPaths();
      for (const [surfaceId, sessionId] of this.managedSessionIds) {
        const path = paths.get(sessionId);
        if (!path || this.reportedPaths.get(surfaceId) === path) continue;
        this.reportedPaths.set(surfaceId, path);
        this.callbacks.onPwdChanged?.(surfaceId, path);
      }
    } catch {
      // Left to the next refresh.
    } finally {
      this.pathPollInFlight = false;
      if (this.pathPollRepeat) {
        this.pathPollRepeat = false;
        void this.refreshManagedPaths();
      }
    }
  }

  showSurface(surfaceId: string): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.showSurface", () => {
      this.terminal?.showSurface(surfaceId);
    });
  }

  hideSurface(surfaceId: string): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.hideSurface", () => {
      this.terminal?.hideSurface(surfaceId);
    });
  }

  focusSurface(surfaceId: string): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.focusSurface", () => {
      this.terminal?.focusSurface(surfaceId);
    });
  }

  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.setVisibleSurfaces", () => {
      this.terminal?.setVisibleSurfaces(surfaceIds);
    });
  }

  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.setBounds", () => {
      this.terminal?.setBounds(surfaceId, bounds);
    });
  }

  blurSurfaces(): void {
    if (!this.terminal) return;
    measureMainProcessOperation("terminal.blurSurfaces", () => {
      this.terminal?.blurSurfaces();
    });
  }

  /** Send a Ghostty binding action to a surface (e.g. "increase_font_size:1"). */
  sendBindingAction(surfaceId: string, action: string): boolean {
    if (!this.terminal) return false;
    return this.terminal.sendBindingAction(surfaceId, action);
  }

  /** Sync the reserved shortcuts list to the native bridge. */
  setReservedShortcuts(shortcuts: ReservedShortcut[]): void {
    if (!this.terminal) return;
    this.terminal.setReservedShortcuts(shortcuts);
  }

  destroyAll(): void {
    if (!this.terminal) return;
    this.stopPathPolling();
    this.managedSessionIds.clear();
    this.reportedPaths.clear();
    this.terminal.destroy();
    this.terminal = null;
    // The private tmux server deliberately outlives the app. Destroying the
    // Ghostty clients detaches them without terminating managed sessions.
    this.managedTmux = null;
    this.surfaceGenerations.clear();
  }
}

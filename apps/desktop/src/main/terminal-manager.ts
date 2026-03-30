import type { BrowserWindow } from "electron";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { GhosttyTerminal, type ReservedShortcut, type TerminalBounds } from "ghostty-electron";

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
    // This matches cmux's approach for macOS bash 3.2 compatibility.
    const bashIntegration = `${dirs.ghosttyResourcesDir}/shell-integration/bash/ghostty.bash`;
    merged.PROMPT_COMMAND = [
      "unset PROMPT_COMMAND;",
      `[ -f "${bashIntegration}" ] && . "${bashIntegration}";`,
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
  onPwdChanged?: (surfaceId: string, pwd: string) => void;
  onNotification?: (surfaceId: string, title: string, body: string) => void;
  onSearchStart?: (surfaceId: string, needle: string) => void;
  onSearchEnd?: (surfaceId: string) => void;
  onSearchTotal?: (surfaceId: string, total: number) => void;
  onSearchSelected?: (surfaceId: string, selected: number) => void;
};

export class TerminalManager {
  private terminal: GhosttyTerminal | null = null;
  private callbacks: TerminalCallback = {};
  /** Resolved path to Devspace's ZDOTDIR wrapper for zsh shell integration. */
  private shellIntegrationZshDir: string | null = null;

  init(mainWindow: BrowserWindow): void {
    this.terminal = new GhosttyTerminal();
    const handle = mainWindow.getNativeWindowHandle();

    // Resolve the native addon path relative to this file's directory.
    // In dev mode, __dirname is apps/desktop/out/main — the addon is in the
    // ghostty-electron package's native build output.
    const nativeAddonPath = resolve(
      __dirname,
      "../../../../packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
    );

    this.terminal.init({ windowHandle: handle, nativeAddonPath });

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

    // Wire up events to callbacks
    this.terminal.on("title-changed", (surfaceId, title) => {
      this.callbacks.onTitleChanged?.(surfaceId, title);
    });

    this.terminal.on("surface-closed", (surfaceId) => {
      this.callbacks.onSurfaceClosed?.(surfaceId);
    });

    this.terminal.on("surface-focused", (surfaceId) => {
      this.callbacks.onSurfaceFocused?.(surfaceId);
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

  createSurface(
    surfaceId: string,
    options?: { cwd?: string; envVars?: Record<string, string> },
  ): void {
    if (!this.terminal) return;

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

    // Only pass envVars if we actually have entries
    const merged = Object.keys(envVars).length > 0 ? { ...options, envVars } : options;

    this.terminal.createSurface(surfaceId, merged);
  }

  destroySurface(surfaceId: string): void {
    if (!this.terminal) return;
    this.terminal.destroySurface(surfaceId);
  }

  showSurface(surfaceId: string): void {
    if (!this.terminal) return;
    this.terminal.showSurface(surfaceId);
  }

  hideSurface(surfaceId: string): void {
    if (!this.terminal) return;
    this.terminal.hideSurface(surfaceId);
  }

  focusSurface(surfaceId: string): void {
    if (!this.terminal) return;
    this.terminal.focusSurface(surfaceId);
  }

  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.terminal) return;
    this.terminal.setVisibleSurfaces(surfaceIds);
  }

  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.terminal) return;
    this.terminal.setBounds(surfaceId, bounds);
  }

  blurSurfaces(): void {
    if (!this.terminal) return;
    this.terminal.blurSurfaces();
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
    this.terminal.destroy();
    this.terminal = null;
  }
}

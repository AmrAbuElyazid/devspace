import type { BrowserWindow } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import {
  loadNativeAddon,
  type GhosttyBridge,
  type NativeBridgeShortcut,
  type TerminalBounds,
} from "./native";

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
};

export class TerminalManager {
  private bridge: GhosttyBridge | null = null;
  private callbacks: TerminalCallback = {};
  private activeSurfaces = new Set<string>();
  /** Resolved path to Devspace's ZDOTDIR wrapper for zsh shell integration. */
  private shellIntegrationZshDir: string | null = null;

  init(mainWindow: BrowserWindow): void {
    this.bridge = loadNativeAddon();
    const handle = mainWindow.getNativeWindowHandle();
    this.bridge.init(handle);

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

    this.bridge.setCallback("title-changed", (surfaceId: unknown, title: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string") {
        this.callbacks.onTitleChanged?.(surfaceId, title);
      }
    });

    this.bridge.setCallback("surface-closed", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.activeSurfaces.delete(surfaceId);
        this.callbacks.onSurfaceClosed?.(surfaceId);
      }
    });

    this.bridge.setCallback("surface-focused", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.callbacks.onSurfaceFocused?.(surfaceId);
      }
    });

    this.bridge.setCallback("pwd-changed", (surfaceId: unknown, pwd: unknown) => {
      if (typeof surfaceId === "string" && typeof pwd === "string") {
        this.callbacks.onPwdChanged?.(surfaceId, pwd);
      }
    });

    this.bridge.setCallback("notification", (surfaceId: unknown, title: unknown, body: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string" && typeof body === "string") {
        this.callbacks.onNotification?.(surfaceId, title, body);
      }
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

  createSurface(
    surfaceId: string,
    options?: { cwd?: string; envVars?: Record<string, string> },
  ): void {
    if (!this.bridge) return;
    this.activeSurfaces.add(surfaceId);

    // Inject shell integration env vars based on user's shell (zsh, bash, fish).
    // This is how cmux does it — per-surface env vars via ghostty_surface_config_s.
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

    this.bridge.createSurface(surfaceId, merged);
  }

  destroySurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.activeSurfaces.delete(surfaceId);
    this.bridge.destroySurface(surfaceId);
  }

  showSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.showSurface(surfaceId);
  }

  hideSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.hideSurface(surfaceId);
  }

  focusSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.focusSurface(surfaceId);
  }

  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.bridge) return;
    this.bridge.setVisibleSurfaces(surfaceIds);
  }

  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.bridge) return;
    this.bridge.resizeSurface(surfaceId, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  blurSurfaces(): void {
    if (!this.bridge) return;
    this.bridge.blurSurfaces();
  }

  /** Send a Ghostty binding action to a surface (e.g. "increase_font_size:1"). */
  sendBindingAction(surfaceId: string, action: string): boolean {
    if (!this.bridge) return false;
    return this.bridge.sendBindingAction(surfaceId, action);
  }

  /** Sync the reserved shortcuts list to the native bridge. */
  setReservedShortcuts(shortcuts: NativeBridgeShortcut[]): void {
    if (!this.bridge) return;
    this.bridge.setReservedShortcuts(shortcuts);
  }

  destroyAll(): void {
    if (!this.bridge) return;
    for (const surfaceId of this.activeSurfaces) {
      this.bridge.destroySurface(surfaceId);
    }
    this.activeSurfaces.clear();
  }
}

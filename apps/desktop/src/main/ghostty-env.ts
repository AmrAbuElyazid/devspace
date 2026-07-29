import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDevelopmentPath } from "./dev-paths";

/** macOS ships a complete terminfo database here as part of the base system. */
const SYSTEM_TERMINFO_DIR = "/usr/share/terminfo";

type GhosttyEnvironmentOptions = {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  cwd: string;
  moduleDir: string;
  env?: NodeJS.ProcessEnv;
  pathExists?: (path: string) => boolean;
  resolveDevPath?: typeof resolveDevelopmentPath;
};

export function configureGhosttyEnvironment(options: GhosttyEnvironmentOptions): void {
  const env = options.env ?? process.env;
  const pathExists = options.pathExists ?? existsSync;
  const resolveDevPath = options.resolveDevPath ?? resolveDevelopmentPath;

  // GHOSTTY_RESOURCES_DIR tells libghostty where shell integration scripts live.
  if (!env.GHOSTTY_RESOURCES_DIR) {
    const resourcesDir = options.isPackaged
      ? join(options.resourcesPath, "ghostty")
      : resolveDevPath("packages/ghostty-electron/deps/libghostty/share/ghostty", {
          appPath: options.appPath,
          cwd: options.cwd,
          moduleDir: options.moduleDir,
        });
    if (pathExists(resourcesDir)) {
      env.GHOSTTY_RESOURCES_DIR = resourcesDir;
    }
  }

  // Resolved at most once, and only when something actually needs it — an
  // environment that already names both terminfo variables must not send us
  // looking through the filesystem.
  let bundledTerminfo: { dir: string; exists: boolean } | null = null;
  const findBundledTerminfo = (): { dir: string; exists: boolean } => {
    if (!bundledTerminfo) {
      const dir = options.isPackaged
        ? join(options.resourcesPath, "terminfo")
        : resolveDevPath("packages/ghostty-electron/deps/libghostty/share/terminfo", {
            appPath: options.appPath,
            cwd: options.cwd,
            moduleDir: options.moduleDir,
          });
      bundledTerminfo = { dir, exists: pathExists(dir) };
    }
    return bundledTerminfo;
  };

  // Keep terminfo outside GHOSTTY_RESOURCES_DIR so the bridge does not force
  // TERM=xterm-ghostty while still making the entry available when requested.
  if (!env.TERMINFO) {
    const bundled = findBundledTerminfo();
    if (bundled.exists) {
      env.TERMINFO = bundled.dir;
    }
  }

  // The bundled terminfo database holds only Ghostty's own entries, and the
  // bundled tmux links a Homebrew libncursesw whose single compiled-in search
  // path is the Cellar directory of whichever machine built it. That path does
  // not exist on a user's Mac, and ncurses never consults /usr/share/terminfo
  // on its own — so common values like xterm-256color resolved nowhere and
  // tmux exited with "missing or unsuitable terminal" before a shell appeared.
  // Naming the system database is what makes it visible at all.
  if (!env.TERMINFO_DIRS) {
    const bundled = findBundledTerminfo();
    const searchPath = [
      ...(bundled.exists ? [bundled.dir] : []),
      ...(pathExists(SYSTEM_TERMINFO_DIR) ? [SYSTEM_TERMINFO_DIR] : []),
    ];
    if (searchPath.length > 0) {
      env.TERMINFO_DIRS = searchPath.join(":");
    }
  }
}

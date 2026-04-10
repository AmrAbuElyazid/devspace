import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDevelopmentPath } from "./dev-paths";

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

  // Keep terminfo outside GHOSTTY_RESOURCES_DIR so the bridge does not force
  // TERM=xterm-ghostty while still making the entry available when requested.
  if (!env.TERMINFO) {
    const terminfoDir = options.isPackaged
      ? join(options.resourcesPath, "terminfo")
      : resolveDevPath("packages/ghostty-electron/deps/libghostty/share/terminfo", {
          appPath: options.appPath,
          cwd: options.cwd,
          moduleDir: options.moduleDir,
        });
    if (pathExists(terminfoDir)) {
      env.TERMINFO = terminfoDir;
    }
  }
}

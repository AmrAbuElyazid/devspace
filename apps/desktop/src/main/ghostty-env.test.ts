import { describe, expect, test, vi } from "vitest";
import { configureGhosttyEnvironment } from "./ghostty-env";

describe("configureGhosttyEnvironment", () => {
  test("sets packaged Ghostty resource paths when they exist", () => {
    const env: NodeJS.ProcessEnv = {};

    configureGhosttyEnvironment({
      isPackaged: true,
      resourcesPath: "/Applications/Devspace.app/Contents/Resources",
      appPath: "/unused",
      cwd: "/unused",
      moduleDir: "/unused",
      env,
      pathExists: () => true,
    });

    expect(env.GHOSTTY_RESOURCES_DIR).toBe("/Applications/Devspace.app/Contents/Resources/ghostty");
    expect(env.TERMINFO).toBe("/Applications/Devspace.app/Contents/Resources/terminfo");
    // Without the system database on the search path the bundled tmux cannot
    // resolve xterm-256color on any Mac that lacks Homebrew's ncurses, and
    // exits before a shell appears.
    expect(env.TERMINFO_DIRS).toBe(
      "/Applications/Devspace.app/Contents/Resources/terminfo:/usr/share/terminfo",
    );
  });

  test("still exposes the system database when no terminfo is bundled", () => {
    const env: NodeJS.ProcessEnv = {};

    configureGhosttyEnvironment({
      isPackaged: true,
      resourcesPath: "/Applications/Devspace.app/Contents/Resources",
      appPath: "/unused",
      cwd: "/unused",
      moduleDir: "/unused",
      env,
      pathExists: (path) => path === "/usr/share/terminfo",
    });

    expect(env.TERMINFO).toBe(undefined);
    expect(env.TERMINFO_DIRS).toBe("/usr/share/terminfo");
  });

  test("leaves the search path unset when neither database is present", () => {
    const env: NodeJS.ProcessEnv = {};

    configureGhosttyEnvironment({
      isPackaged: true,
      resourcesPath: "/Applications/Devspace.app/Contents/Resources",
      appPath: "/unused",
      cwd: "/unused",
      moduleDir: "/unused",
      env,
      pathExists: () => false,
    });

    expect("TERMINFO_DIRS" in env).toBe(false);
  });

  test("resolves development Ghostty resource paths when unset", () => {
    const env: NodeJS.ProcessEnv = {};
    const resolveDevPath = vi
      .fn()
      .mockReturnValueOnce("/repo/packages/ghostty-electron/deps/libghostty/share/ghostty")
      .mockReturnValueOnce("/repo/packages/ghostty-electron/deps/libghostty/share/terminfo");

    configureGhosttyEnvironment({
      isPackaged: false,
      resourcesPath: "/unused",
      appPath: "/repo/apps/desktop",
      cwd: "/repo/apps/desktop",
      moduleDir: "/repo/apps/desktop/src/main",
      env,
      pathExists: () => true,
      resolveDevPath,
    });

    expect(resolveDevPath).toHaveBeenCalledTimes(2);
    expect(env.GHOSTTY_RESOURCES_DIR).toBe(
      "/repo/packages/ghostty-electron/deps/libghostty/share/ghostty",
    );
    expect(env.TERMINFO).toBe("/repo/packages/ghostty-electron/deps/libghostty/share/terminfo");
  });

  test("preserves existing environment values", () => {
    const env: NodeJS.ProcessEnv = {
      GHOSTTY_RESOURCES_DIR: "/custom/ghostty",
      TERMINFO: "/custom/terminfo",
      TERMINFO_DIRS: "/custom/terminfo-dirs",
    };
    const resolveDevPath = vi.fn();

    configureGhosttyEnvironment({
      isPackaged: false,
      resourcesPath: "/unused",
      appPath: "/repo/apps/desktop",
      cwd: "/repo/apps/desktop",
      moduleDir: "/repo/apps/desktop/src/main",
      env,
      pathExists: () => true,
      resolveDevPath,
    });

    expect(env).toEqual({
      GHOSTTY_RESOURCES_DIR: "/custom/ghostty",
      TERMINFO: "/custom/terminfo",
      TERMINFO_DIRS: "/custom/terminfo-dirs",
    });
    expect(resolveDevPath).not.toHaveBeenCalled();
  });
});

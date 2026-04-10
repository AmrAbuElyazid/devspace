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
    });
    expect(resolveDevPath).not.toHaveBeenCalled();
  });
});

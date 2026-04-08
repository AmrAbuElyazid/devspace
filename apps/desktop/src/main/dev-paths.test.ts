import { describe, expect, test } from "vitest";
import { resolveDevelopmentPath } from "./dev-paths";

describe("resolveDevelopmentPath", () => {
  test("resolves repo assets from the app workspace cwd", () => {
    const path = resolveDevelopmentPath(
      "packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
      {
        appPath: "/repo/apps/desktop",
        cwd: "/repo/apps/desktop",
        moduleDir: "/repo/apps/desktop/src/main",
        pathExists: (candidate) =>
          candidate === "/repo/packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
      },
    );

    expect(path).toBe("/repo/packages/ghostty-electron/native/build/Release/ghostty_bridge.node");
  });

  test("resolves repo assets from built out/main launches", () => {
    const path = resolveDevelopmentPath(
      "packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
      {
        appPath: "/repo/apps/desktop/out/main",
        cwd: "/repo/apps/desktop",
        moduleDir: "/repo/apps/desktop/out/main",
        pathExists: (candidate) =>
          candidate === "/repo/packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
      },
    );

    expect(path).toBe("/repo/packages/ghostty-electron/native/build/Release/ghostty_bridge.node");
  });

  test("falls back to the derived repo-root path when filesystem checks are mocked", () => {
    const path = resolveDevelopmentPath(
      "packages/ghostty-electron/native/build/Release/ghostty_bridge.node",
      {
        appPath: "/Applications/Devspace.app/Contents/Resources/app",
        cwd: "/repo/apps/desktop",
        moduleDir: "/repo/apps/desktop/src/main",
        pathExists: () => false,
      },
    );

    expect(path).toBe("/repo/packages/ghostty-electron/native/build/Release/ghostty_bridge.node");
  });

  test("throws when no candidate exists", () => {
    expect(() =>
      resolveDevelopmentPath("packages/ghostty-electron/native/build/Release/ghostty_bridge.node", {
        appPath: "/tmp/devspace/out/main",
        cwd: "/tmp/devspace",
        moduleDir: "/tmp/devspace/out/main",
        pathExists: () => false,
      }),
    ).toThrow(/Could not resolve development path/);
  });
});

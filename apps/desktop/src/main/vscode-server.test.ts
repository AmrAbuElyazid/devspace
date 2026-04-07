import { beforeEach, describe, expect, test, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("child_process", () => childProcessMocks);
vi.mock("fs", () => fsMocks);
vi.mock("os", () => ({ homedir: () => "/Users/test" }));
vi.mock("./dev-mode", () => ({ VSCODE_PORT: 18562, DATA_DIR_SUFFIX: "" }));

import { resolveVscodeCli } from "./vscode-server";

describe("resolveVscodeCli", () => {
  beforeEach(() => {
    childProcessMocks.execFileSync.mockReset();
    childProcessMocks.execSync.mockReset();
    childProcessMocks.spawn.mockReset();
    fsMocks.existsSync.mockReset();
    fsMocks.mkdirSync.mockReset();
  });

  test("uses an explicit configured file path when it exists", () => {
    fsMocks.existsSync.mockImplementation((filePath: string) => filePath === "/custom/bin/code");

    expect(resolveVscodeCli("/custom/bin/code")).toEqual({
      path: "/custom/bin/code",
      source: "configured-path",
    });
    expect(childProcessMocks.execFileSync).not.toHaveBeenCalled();
  });

  test("resolves a configured command name through PATH", () => {
    childProcessMocks.execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "code-insiders") {
        return "/usr/local/bin/code-insiders\n";
      }
      throw new Error("unexpected command lookup");
    });

    expect(resolveVscodeCli("code-insiders")).toEqual({
      path: "/usr/local/bin/code-insiders",
      source: "configured-command",
    });
  });

  test("prefers the standard VS Code app bundle over whatever owns code in PATH", () => {
    fsMocks.existsSync.mockImplementation(
      (filePath: string) =>
        filePath === "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    );
    childProcessMocks.execFileSync.mockReturnValue("/opt/cursor/bin/code\n");

    expect(resolveVscodeCli()).toEqual({
      path: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
      source: "bundle",
    });
    expect(childProcessMocks.execFileSync).not.toHaveBeenCalled();
  });

  test("does not silently fall back when the configured CLI is invalid", () => {
    fsMocks.existsSync.mockReturnValue(false);

    expect(resolveVscodeCli("/missing/code")).toEqual({
      path: null,
      reason: "configured-not-found",
      attempted: "/missing/code",
    });
  });
});

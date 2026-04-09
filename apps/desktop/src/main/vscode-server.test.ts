import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

const netMocks = vi.hoisted(() => {
  const portFreeResults: boolean[] = [];

  return {
    createServer: vi.fn(() => {
      let errorHandler: (() => void) | undefined;

      const server = {
        once: vi.fn((event: string, handler: () => void) => {
          if (event === "error") {
            errorHandler = handler;
          }
          return server;
        }),
        listen: vi.fn((_port: number, _host: string, handler: () => void) => {
          const isFree = portFreeResults.shift() ?? true;
          if (isFree) {
            handler();
          } else {
            errorHandler?.();
          }
          return server;
        }),
        close: vi.fn((handler?: () => void) => {
          handler?.();
          return server;
        }),
      };

      return server;
    }),
    portFreeResults,
  };
});

vi.mock("child_process", () => childProcessMocks);
vi.mock("fs", () => fsMocks);
vi.mock("net", () => ({ createServer: netMocks.createServer }));
vi.mock("os", () => ({ homedir: () => "/Users/test" }));
vi.mock("./dev-mode", () => ({ VSCODE_PORT: 18562, DATA_DIR_SUFFIX: "" }));

import { resolveVscodeCli, VscodeServerManager } from "./vscode-server";

function createMockChildProcess() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const onceListeners = new Map<string, (...args: unknown[]) => void>();

  const child = {
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return child;
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      onceListeners.set(event, handler);
      return child;
    }),
    kill: vi.fn(),
    pid: 1234,
    emit: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.(...args);
      const onceHandler = onceListeners.get(event);
      if (onceHandler) {
        onceListeners.delete(event);
        onceHandler(...args);
      }
    },
  };

  return child;
}

const fetchMock = vi.fn();
const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

describe("resolveVscodeCli", () => {
  beforeEach(() => {
    childProcessMocks.execFileSync.mockReset();
    childProcessMocks.spawn.mockReset();
    fsMocks.existsSync.mockReset();
    fsMocks.mkdirSync.mockReset();
    fsMocks.readFileSync.mockReset();
    fsMocks.writeFileSync.mockReset();
    fsMocks.unlinkSync.mockReset();
    netMocks.createServer.mockClear();
    netMocks.portFreeResults.length = 0;
    fetchMock.mockReset();
    processKillSpy.mockReset().mockImplementation(() => true);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "which" && args[0] === "code-insiders") {
        return "/usr/local/bin/code-insiders\n";
      }
      throw new Error("unexpected lookup");
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

  test("starts serve-web with a stable token file, base path, and pid file", async () => {
    const child = createMockChildProcess();
    const tokenFilePath = "/tmp/devspace-vscode/connection-token";

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === "/custom/bin/code" || filePath === tokenFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.spawn.mockReturnValue(child);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    netMocks.portFreeResults.push(true, true);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");
    const result = await manager.start("/tmp/project", "/custom/bin/code");

    expect(childProcessMocks.spawn).toHaveBeenCalledWith(
      "/custom/bin/code",
      [
        "serve-web",
        "--host",
        "127.0.0.1",
        "--port",
        "18562",
        "--server-base-path",
        "/devspace-vscode",
        "--connection-token-file",
        tokenFilePath,
        "--accept-server-license-terms",
        "--server-data-dir",
        "/tmp/devspace-vscode",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token",
    );

    const pidWriteCall = fsMocks.writeFileSync.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/devspace-vscode/server.pid",
    );
    expect(pidWriteCall?.[1]).toBe("1234\n");

    const parsed = new URL(result.url);
    expect(parsed.pathname).toBe("/devspace-vscode");
    expect(parsed.searchParams.get("tkn")).toBe("stable-token");
    expect(parsed.searchParams.get("folder")).toBe("/tmp/project");
  });

  test("reuses an existing server only when the recorded pid owns the fixed port", async () => {
    const tokenFilePath = "/tmp/devspace-vscode/connection-token";
    const pidFilePath = "/tmp/devspace-vscode/server.pid";

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === tokenFilePath || filePath === pidFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      if (filePath === pidFilePath) {
        return "9999\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "9999\n";
      }
      throw new Error("unexpected lsof call");
    });
    processKillSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (pid === 9999 && signal === 0) {
        return true;
      }
      throw new Error("unexpected kill call");
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    netMocks.portFreeResults.push(false);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");
    const result = await manager.start("/tmp/project", "/missing/code");

    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    expect(result).toEqual({
      port: 18562,
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=%2Ftmp%2Fproject",
    });
  });

  test("fails closed when the fixed port is occupied but no pid file exists", async () => {
    const tokenFilePath = "/tmp/devspace-vscode/connection-token";

    fsMocks.existsSync.mockImplementation((filePath: string) => {
      if (filePath === "/custom/bin/code") return true;
      if (filePath === tokenFilePath) return true;
      return false;
    });
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    netMocks.portFreeResults.push(false, false);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");

    await expect(manager.start("/tmp/project", "/custom/bin/code")).rejects.toThrow(
      "Port 18562 is already in use",
    );
    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
  });

  test("fails closed when the recorded pid is alive but does not own the fixed port", async () => {
    const tokenFilePath = "/tmp/devspace-vscode/connection-token";
    const pidFilePath = "/tmp/devspace-vscode/server.pid";

    fsMocks.existsSync.mockImplementation(
      (filePath: string) =>
        filePath === "/custom/bin/code" || filePath === tokenFilePath || filePath === pidFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      if (filePath === pidFilePath) return "9999\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "8888\n";
      }
      throw new Error("unexpected lsof call");
    });
    processKillSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (pid === 9999 && signal === 0) {
        return true;
      }
      throw new Error("unexpected kill call");
    });
    netMocks.portFreeResults.push(false, false);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");

    await expect(manager.start("/tmp/project", "/custom/bin/code")).rejects.toThrow(
      "Port 18562 is already in use",
    );
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(pidFilePath);
  });

  test("reopening a folder clears stale adopted state and spawns a fresh server", async () => {
    const adoptedTokenFilePath = "/tmp/devspace-vscode/connection-token";
    const adoptedPidFilePath = "/tmp/devspace-vscode/server.pid";
    const child = createMockChildProcess();
    const alivePids = new Set([9999]);

    fsMocks.existsSync.mockImplementation((filePath: string) => {
      if (filePath === adoptedTokenFilePath) return true;
      if (filePath === adoptedPidFilePath && alivePids.has(9999)) return true;
      if (filePath === "/custom/bin/code") return true;
      return false;
    });
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === adoptedTokenFilePath) return "stable-token\n";
      if (filePath === adoptedPidFilePath) return "9999\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return alivePids.has(9999) ? "9999\n" : "";
      }
      throw new Error("unexpected lsof call");
    });
    processKillSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (pid !== 9999) {
        throw new Error("unexpected kill call");
      }
      if (signal === 0) {
        if (alivePids.has(pid)) {
          return true;
        }
        throw new Error("ESRCH");
      }
      return true;
    });
    childProcessMocks.spawn.mockReturnValue(child);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    netMocks.portFreeResults.push(false, true, true);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");
    await manager.start("/tmp/project", "/missing/code");

    alivePids.delete(9999);

    const result = await manager.start("/tmp/project", "/custom/bin/code");

    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(adoptedPidFilePath);
    expect(result).toEqual({
      port: 18562,
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=%2Ftmp%2Fproject",
    });
  });

  test("stopAll can still stop an adopted server after all folders were released", async () => {
    const tokenFilePath = "/tmp/devspace-vscode/connection-token";
    const pidFilePath = "/tmp/devspace-vscode/server.pid";
    const alivePids = new Set([9999]);

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === tokenFilePath || filePath === pidFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      if (filePath === pidFilePath) return "9999\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return alivePids.has(9999) ? "9999\n" : "";
      }
      throw new Error("unexpected lsof call");
    });
    processKillSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (pid !== 9999) {
        throw new Error("unexpected kill call");
      }
      if (signal === 0) {
        if (alivePids.has(pid)) {
          return true;
        }
        throw new Error("ESRCH");
      }
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        alivePids.delete(pid);
        return true;
      }
      return true;
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    netMocks.portFreeResults.push(false);

    const manager = new VscodeServerManager("/tmp/devspace-vscode");
    await manager.start("/tmp/project", "/missing/code");
    manager.release("/tmp/project");

    manager.keepRunning = false;
    await manager.stopAll();

    expect(processKillSpy).toHaveBeenCalledWith(9999, "SIGTERM");
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(pidFilePath);
  });
});

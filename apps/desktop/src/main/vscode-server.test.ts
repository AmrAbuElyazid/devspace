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

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

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

function managedListenerCommand(
  port: number,
  basePath: string,
  tokenFilePath: string,
  serverDataDir: string,
): string {
  return `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code-tunnel serve-web --host 127.0.0.1 --port ${port} --server-base-path ${basePath} --connection-token-file ${tokenFilePath} --accept-server-license-terms --server-data-dir ${serverDataDir}`;
}

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
    processKillSpy.mockReset().mockImplementation(() => true);
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

  test("starts serve-web with a stable token file, base path, and listener pid file", async () => {
    const child = createMockChildProcess();
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === "/custom/bin/code" || filePath === tokenFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "5678\n";
      }
      if (command === "ps" && args[1] === "5678") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    childProcessMocks.spawn.mockReturnValue(child);
    netMocks.portFreeResults.push(true, true);

    const manager = new VscodeServerManager(serverDataDir);
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
        serverDataDir,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      },
    );

    const pidWriteCall = fsMocks.writeFileSync.mock.calls.find(
      (call: unknown[]) => call[0] === `${serverDataDir}/server.pid`,
    );
    expect(pidWriteCall?.[1]).toBe("5678\n");

    const parsed = new URL(result.url);
    expect(parsed.pathname).toBe("/devspace-vscode");
    expect(parsed.searchParams.get("tkn")).toBe("stable-token");
    expect(parsed.searchParams.get("folder")).toBe("/tmp/project");
  });

  test("adopts a matching legacy listener even without a pid file", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;

    fsMocks.existsSync.mockImplementation((filePath: string) => filePath === tokenFilePath);
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "9999\n";
      }
      if (command === "ps" && args[1] === "9999") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    netMocks.portFreeResults.push(false);

    const manager = new VscodeServerManager(serverDataDir);
    const result = await manager.start("/tmp/project", "/missing/code");

    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(`${serverDataDir}/server.pid`, "9999\n", {
      encoding: "utf-8",
      mode: 0o600,
    });
    expect(result).toEqual({
      port: 18562,
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=%2Ftmp%2Fproject",
    });
  });

  test("fails closed when the fixed port is occupied by a non-managed listener", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === "/custom/bin/code" || filePath === tokenFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) {
        return "stable-token\n";
      }
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "8888\n";
      }
      if (command === "ps" && args[1] === "8888") {
        return "/usr/bin/python3 -m http.server 18562\n";
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    netMocks.portFreeResults.push(false, false);

    const manager = new VscodeServerManager(serverDataDir);

    await expect(manager.start("/tmp/project", "/custom/bin/code")).rejects.toThrow(
      "Port 18562 is already in use",
    );
    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
  });

  test("reopening a folder clears stale adopted state and spawns a fresh server", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;
    const child = createMockChildProcess();
    const state = { listenerPid: 9999 };

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === tokenFilePath || filePath === "/custom/bin/code",
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return state.listenerPid === 0 ? "" : `${state.listenerPid}\n`;
      }
      if (command === "ps" && args[1] === "9999") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      if (command === "ps" && args[1] === "5678") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    childProcessMocks.spawn.mockImplementation(() => {
      state.listenerPid = 5678;
      return child;
    });
    netMocks.portFreeResults.push(false, true, true);

    const manager = new VscodeServerManager(serverDataDir);
    await manager.start("/tmp/project", "/missing/code");

    state.listenerPid = 0;

    const result = await manager.start("/tmp/project", "/custom/bin/code");

    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      port: 18562,
      url: "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=%2Ftmp%2Fproject",
    });
  });

  test("wrapper exit keeps state when the managed listener is still alive", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;
    const child = createMockChildProcess();

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === tokenFilePath || filePath === "/custom/bin/code",
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return "5678\n";
      }
      if (command === "ps" && args[1] === "5678") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    childProcessMocks.spawn.mockReturnValue(child);
    netMocks.portFreeResults.push(true, true);

    const manager = new VscodeServerManager(serverDataDir);
    const first = await manager.start("/tmp/project", "/custom/bin/code");
    child.emit("exit", 0);
    const second = await manager.start("/tmp/project-2", "/missing/code");

    expect(first.port).toBe(18562);
    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    expect(second.url).toBe(
      "http://127.0.0.1:18562/devspace-vscode?tkn=stable-token&folder=%2Ftmp%2Fproject-2",
    );
  });

  test("stopAll stops the managed listener when keepRunning is false", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;
    const alivePids = new Set([9999]);

    fsMocks.existsSync.mockImplementation((filePath: string) => filePath === tokenFilePath);
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args[1] === "-iTCP:18562") {
        return alivePids.has(9999) ? "9999\n" : "";
      }
      if (command === "ps" && args[1] === "9999") {
        return `${managedListenerCommand(18562, "/devspace-vscode", tokenFilePath, serverDataDir)}\n`;
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
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
    netMocks.portFreeResults.push(false);

    const manager = new VscodeServerManager(serverDataDir);
    await manager.start("/tmp/project", "/missing/code");
    manager.release("/tmp/project");

    manager.keepRunning = false;
    await manager.stopAll();

    expect(processKillSpy).toHaveBeenCalledWith(9999, "SIGTERM");
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(`${serverDataDir}/server.pid`);
  });
});

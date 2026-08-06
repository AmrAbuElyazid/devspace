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

import { resolveVscodeCli, VscodeServerManager, waitForManagedListener } from "./vscode-server";

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
    stdout: { on: vi.fn() },
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
        detached: true,
      },
    );

    const pidWriteCall = fsMocks.writeFileSync.mock.calls.find(
      (call: unknown[]) => call[0] === `${serverDataDir}/server.pid`,
    );
    expect(pidWriteCall?.[1]).toBe('{"version":1,"listenerPid":5678,"processGroupId":1234}\n');

    const parsed = new URL(result.url);
    expect(parsed.pathname).toBe("/devspace-vscode");
    expect(parsed.searchParams.get("tkn")).toBe("stable-token");
    expect(parsed.searchParams.get("folder")).toBe("/tmp/project");

    // Both pipes are read. stdio asks for a pipe on each, and an unread pipe
    // fills at 64KB and then blocks the CLI on its next write — which the
    // first-run download, reporting progress on stdout, reaches on its own.
    expect(child.stdout.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(child.stderr.on).toHaveBeenCalledWith("data", expect.any(Function));
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
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      `${serverDataDir}/server.pid`,
      '{"version":1,"listenerPid":9999}\n',
      {
        encoding: "utf-8",
        mode: 0o600,
      },
    );
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

  test("does not run a queued shutdown after a newer consumer becomes active", async () => {
    const manager = new VscodeServerManager("/tmp/devspace-vscode");
    const internals = manager as unknown as {
      folders: Map<string, { url: string; refCount: number }>;
      startLock: Promise<unknown>;
      stopManagedServer: () => Promise<void>;
    };
    const stopSpy = vi.spyOn(internals, "stopManagedServer").mockResolvedValue();
    internals.folders.set("/tmp/old", { url: "http://old", refCount: 1 });
    internals.startLock = Promise.resolve().then(() => {
      internals.folders.set("/tmp/new", { url: "http://new", refCount: 1 });
    });

    manager.release("/tmp/old");
    await internals.startLock;

    expect(internals.folders.has("/tmp/new")).toBe(true);
    expect(stopSpy).not.toHaveBeenCalled();
  });

  test("reconciles only stale processes with the full Devspace ownership signature", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;
    const managedCommand = managedListenerCommand(
      18562,
      "/devspace-vscode",
      tokenFilePath,
      serverDataDir,
    );
    const alivePids = new Set([7777, 8888]);

    fsMocks.existsSync.mockImplementation((filePath: string) => filePath === tokenFilePath);
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      throw new Error("no ownership record");
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof") return "";
      if (command === "ps" && args[0] === "-axo") {
        return ` 7777 ${managedCommand}\n 8888 /usr/bin/python3 -m http.server 18562\n`;
      }
      if (command === "ps" && args[1] === "7777") return `${managedCommand}\n`;
      if (command === "ps" && args[1] === "8888") {
        return "/usr/bin/python3 -m http.server 18562\n";
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });
    processKillSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) {
        if (alivePids.has(pid)) return true;
        throw new Error("ESRCH");
      }
      alivePids.delete(pid);
      return true;
    });

    const manager = new VscodeServerManager(serverDataDir);
    await (
      manager as unknown as { reconcileStaleManagedProcesses: () => Promise<void> }
    ).reconcileStaleManagedProcesses();

    expect(processKillSpy).toHaveBeenCalledWith(7777, "SIGTERM");
    expect(processKillSpy).not.toHaveBeenCalledWith(8888, "SIGTERM");
  });

  test("never kills a reused pid when its command does not prove Devspace ownership", async () => {
    const serverDataDir = "/tmp/devspace-vscode";
    const tokenFilePath = `${serverDataDir}/connection-token`;
    const pidFilePath = `${serverDataDir}/server.pid`;

    fsMocks.existsSync.mockImplementation(
      (filePath: string) => filePath === tokenFilePath || filePath === pidFilePath,
    );
    fsMocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath === tokenFilePath) return "stable-token\n";
      if (filePath === pidFilePath) return "8888\n";
      throw new Error(`Unexpected read for ${filePath}`);
    });
    childProcessMocks.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof") return "";
      if (command === "ps" && args[0] === "-axo") {
        return " 8888 /usr/bin/python3 -m http.server 18562\n";
      }
      if (command === "ps" && args[1] === "8888") {
        return "/usr/bin/python3 -m http.server 18562\n";
      }
      throw new Error(`Unexpected execFileSync call: ${command} ${args.join(" ")}`);
    });

    const manager = new VscodeServerManager(serverDataDir);
    await (
      manager as unknown as { reconcileStaleManagedProcesses: () => Promise<void> }
    ).reconcileStaleManagedProcesses();

    expect(processKillSpy).not.toHaveBeenCalledWith(8888, expect.anything());
    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(pidFilePath);
  });
});

describe("waitForManagedListener", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("keeps waiting through a long first-run download as long as the CLI is talking", async () => {
    // `code serve-web` downloads the server before it binds the port. On a slow
    // link that is minutes — far past any fixed startup budget — but it reports
    // progress the whole way, so the wait is driven by silence, not elapsed time.
    let listenerPid: number | null = null;
    let lastOutputAt = Date.now();

    const pending = waitForManagedListener({
      getPid: () => listenerPid,
      getLastOutputAt: () => lastOutputAt,
      getExitedAt: () => null,
      idleTimeoutMs: 60_000,
    });

    // Five minutes of download, narrated every 30s.
    for (let elapsed = 0; elapsed < 5 * 60_000; elapsed += 30_000) {
      await vi.advanceTimersByTimeAsync(30_000);
      lastOutputAt = Date.now();
    }

    listenerPid = 4242;
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toBe(4242);
  });

  test("gives up once the CLI goes silent with no listener", async () => {
    const lastOutputAt = Date.now();
    const pending = waitForManagedListener({
      getPid: () => null,
      getLastOutputAt: () => lastOutputAt,
      getExitedAt: () => null,
      idleTimeoutMs: 60_000,
    });
    const settled = pending.catch((error: unknown) => error);

    // Past the deadline, plus a poll interval for the check that trips on it.
    await vi.advanceTimersByTimeAsync(60_000 + 400);

    await expect(settled).resolves.toMatchObject({
      message: expect.stringContaining("no output and no listener"),
    });
  });

  test("fails fast when the process exits without ever listening", async () => {
    // Rather than sitting out the whole idle timeout on a CLI that is gone.
    const exitedAt = Date.now();
    const pending = waitForManagedListener({
      getPid: () => null,
      getLastOutputAt: () => exitedAt,
      getExitedAt: () => exitedAt,
      idleTimeoutMs: 60_000,
    });
    const settled = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(3_000);

    await expect(settled).resolves.toMatchObject({
      message: expect.stringContaining("exited before it started listening"),
    });
  });

  test("still adopts a listener the wrapper left behind when it exited", async () => {
    // The CLI hands off to the server process and exits; the listener it
    // started is seconds behind it. That is a normal start, not a failure.
    let listenerPid: number | null = null;
    const exitedAt = Date.now();

    const pending = waitForManagedListener({
      getPid: () => listenerPid,
      getLastOutputAt: () => exitedAt,
      getExitedAt: () => exitedAt,
      idleTimeoutMs: 60_000,
    });

    await vi.advanceTimersByTimeAsync(400);
    listenerPid = 777;
    await vi.advanceTimersByTimeAsync(400);

    await expect(pending).resolves.toBe(777);
  });
});

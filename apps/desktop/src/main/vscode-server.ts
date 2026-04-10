import { randomBytes } from "crypto";
import { spawn, execFileSync, type ChildProcess } from "child_process";
import { createServer } from "net";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { EditorCliStatus } from "../shared/types";
import { VSCODE_PORT, DATA_DIR_SUFFIX } from "./dev-mode";

const VSCODE_SERVER_BASE_PATH = `/devspace-vscode${DATA_DIR_SUFFIX}`;
const VSCODE_CONNECTION_TOKEN_FILENAME = "connection-token";
const VSCODE_PID_FILENAME = "server.pid";

function createConnectionToken(): string {
  return randomBytes(24).toString("base64url");
}

function readOrCreateConnectionToken(tokenFilePath: string): string {
  if (existsSync(tokenFilePath)) {
    try {
      const existingToken = readFileSync(tokenFilePath, "utf-8").trim();
      if (existingToken.length > 0) {
        return existingToken;
      }
    } catch (err) {
      console.warn("[vscode-server] failed to read connection token, regenerating:", err);
    }
  }

  const token = createConnectionToken();
  writeFileSync(tokenFilePath, `${token}\n`, { encoding: "utf-8", mode: 0o600 });
  return token;
}

/** Check if a port is available by trying to bind to it. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

const DEFAULT_VSCODE_CLI_CANDIDATES = [
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  join(homedir(), "Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"),
];

function normalizeConfiguredCli(rawCli?: string): string | null {
  if (typeof rawCli !== "string") {
    return null;
  }

  const trimmed = rawCli.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeFilePath(value: string): boolean {
  return value.includes("/") || value.startsWith(".");
}

/** Locate a command in PATH. Returns the resolved executable path or null. */
function findCommandInPath(command: string): string | null {
  try {
    return execFileSync("which", [command], { encoding: "utf-8" }).trim() || null;
  } catch (err) {
    console.warn(`[vscode-server] CLI lookup failed for ${command}:`, err);
    return null;
  }
}

function getListeningPid(port: number): number | null {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf-8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const uniquePids = [
      ...new Set(output.map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)),
    ];
    if (uniquePids.length !== 1) {
      return null;
    }

    return uniquePids[0] ?? null;
  } catch {
    return null;
  }
}

function getProcessCommand(pid: number): string | null {
  try {
    const output = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf-8",
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export function resolveVscodeCli(configuredCli?: string): EditorCliStatus {
  const normalizedConfiguredCli = normalizeConfiguredCli(configuredCli);
  if (normalizedConfiguredCli) {
    if (looksLikeFilePath(normalizedConfiguredCli)) {
      return existsSync(normalizedConfiguredCli)
        ? { path: normalizedConfiguredCli, source: "configured-path" }
        : {
            path: null,
            reason: "configured-not-found",
            attempted: normalizedConfiguredCli,
          };
    }

    const configuredCommandPath = findCommandInPath(normalizedConfiguredCli);
    return configuredCommandPath
      ? { path: configuredCommandPath, source: "configured-command" }
      : {
          path: null,
          reason: "configured-not-found",
          attempted: normalizedConfiguredCli,
        };
  }

  for (const candidate of DEFAULT_VSCODE_CLI_CANDIDATES) {
    if (existsSync(candidate)) {
      return { path: candidate, source: "bundle" };
    }
  }

  const cliFromPath = findCommandInPath("code");
  return cliFromPath ? { path: cliFromPath, source: "path" } : { path: null, reason: "not-found" };
}

/** Wait for a listener PID to appear on the fixed port. */
function waitForPid(
  getPid: () => number | null,
  timeoutMs = 30_000,
  intervalMs = 200,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`VS Code server listener did not appear within ${timeoutMs}ms`));
        return;
      }

      const pid = getPid();
      if (pid !== null) {
        resolve(pid);
        return;
      }

      setTimeout(check, intervalMs);
    };
    check();
  });
}

interface FolderEntry {
  url: string;
  refCount: number;
}

export class VscodeServerManager {
  /** Per-folder URL entries with reference counting. */
  private folders = new Map<string, FolderEntry>();
  /** The single shared server process when launched by this app process. */
  private serverProcess: ChildProcess | null = null;
  private serverDataDir: string;
  private connectionTokenFilePath: string;
  private connectionToken: string;
  private pidFilePath: string;

  /**
   * Serialization lock for start(). All calls chain through this promise so
   * only one caller does ownership checks / process spawn at a time.
   */
  private startLock: Promise<unknown> = Promise.resolve();

  /** Whether to leave the server running after app quit (default: false). */
  keepRunning = false;

  constructor(serverDataDir?: string) {
    this.serverDataDir =
      serverDataDir || join(homedir(), ".devspace", `vscode-server-data${DATA_DIR_SUFFIX}`);
    mkdirSync(this.serverDataDir, { recursive: true });
    this.connectionTokenFilePath = join(this.serverDataDir, VSCODE_CONNECTION_TOKEN_FILENAME);
    this.connectionToken = readOrCreateConnectionToken(this.connectionTokenFilePath);
    this.pidFilePath = join(this.serverDataDir, VSCODE_PID_FILENAME);
  }

  /** Check if VS Code CLI is available. */
  isAvailable(configuredCli?: string): boolean {
    return resolveVscodeCli(configuredCli).path !== null;
  }

  getCliStatus(configuredCli?: string): EditorCliStatus {
    return resolveVscodeCli(configuredCli);
  }

  /**
   * Start (or reuse) a `code serve-web` server for the given folder.
   *
   * All calls are serialized so concurrent requests for different folders
   * don't race on ownership detection or process spawn. A single
   * `code serve-web` process is shared across all folders.
   */
  async start(folder?: string, configuredCli?: string): Promise<{ url: string; port: number }> {
    const result = new Promise<{ url: string; port: number }>((resolve, reject) => {
      this.startLock = this.startLock.then(
        () => this._startImpl(folder, configuredCli).then(resolve, reject),
        () => this._startImpl(folder, configuredCli).then(resolve, reject),
      );
    });
    return result;
  }

  /** Sentinel key used for no-folder editor sessions. */
  private static NO_FOLDER_KEY = "__no_folder__";

  private async _startImpl(
    folder?: string,
    configuredCli?: string,
  ): Promise<{ url: string; port: number }> {
    const key = folder ?? VscodeServerManager.NO_FOLDER_KEY;

    // Adopted servers are not child processes, so revalidate cached folder entries
    // against the current fixed-port owner before reusing them.
    if (
      !this.serverProcess &&
      this.folders.size > 0 &&
      this.resolveManagedListeningPid() === null
    ) {
      console.warn(
        "[vscode-server] clearing stale adopted server state after ownership check failed",
      );
      this.folders.clear();
    }

    const existing = this.folders.get(key);
    if (existing) {
      existing.refCount++;
      return { url: existing.url, port: VSCODE_PORT };
    }

    if (this.serverProcess || this.folders.size > 0) {
      return this.addFolder(key, folder);
    }

    if (await this.reuseRunningServer()) {
      return this.addFolder(key, folder);
    }

    await this.assertPortIsAvailableForManagedServer();

    const resolvedCli = resolveVscodeCli(configuredCli);
    if (!resolvedCli.path) {
      if ("reason" in resolvedCli && resolvedCli.reason === "configured-not-found") {
        throw new Error(
          `Configured VS Code CLI not found: ${resolvedCli.attempted}. Set a valid executable name or absolute path in Settings.`,
        );
      }

      throw new Error(
        "VS Code CLI not found. Install VS Code or configure a VS Code CLI path in Settings.",
      );
    }

    const child = spawn(
      resolvedCli.path,
      [
        "serve-web",
        "--host",
        "127.0.0.1",
        "--port",
        String(VSCODE_PORT),
        "--server-base-path",
        VSCODE_SERVER_BASE_PATH,
        "--connection-token-file",
        this.connectionTokenFilePath,
        "--accept-server-license-terms",
        "--server-data-dir",
        this.serverDataDir,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      },
    );

    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[vscode-server:${VSCODE_PORT}] ${msg}`);
    });

    child.on("error", (err) => {
      console.error(`[vscode-server:${VSCODE_PORT}] process error:`, err);
      this.handleProcessExitOrError();
    });

    child.on("exit", (code) => {
      console.log(`[vscode-server:${VSCODE_PORT}] exited with code ${code}`);
      this.handleProcessExitOrError();
    });

    this.serverProcess = child;

    try {
      const listenerPid = await waitForPid(() => this.resolveManagedListeningPid());
      this.writePidFile(listenerPid);
    } catch (err) {
      await this.stopManagedServer();
      throw err;
    }

    console.log(`[vscode-server] started on port ${VSCODE_PORT}`);
    return this.addFolder(key, folder);
  }

  /**
   * Reuse a fixed-port Devspace-managed server only when the current listener
   * matches Devspace's expected serve-web command line.
   */
  private async reuseRunningServer(): Promise<boolean> {
    if (await isPortFree(VSCODE_PORT)) return false;

    const pid = this.resolveManagedListeningPid();
    if (pid === null) {
      return false;
    }

    this.writePidFile(pid);
    console.log(
      `[vscode-server] reusing existing Devspace-managed server (pid ${pid}) on port ${VSCODE_PORT}`,
    );
    return true;
  }

  private buildServerUrl(folder?: string): string {
    const url = new URL(`http://127.0.0.1:${VSCODE_PORT}${VSCODE_SERVER_BASE_PATH}`);
    url.searchParams.set("tkn", this.connectionToken);
    if (folder) {
      url.searchParams.set("folder", folder);
    }
    return url.toString();
  }

  /** Create a folder entry pointing at the shared server. */
  private addFolder(key: string, folder?: string): { url: string; port: number } {
    const url = this.buildServerUrl(folder);
    this.folders.set(key, { url, refCount: 1 });
    console.log(`[vscode-server] serving ${folder ?? "(no folder)"}`);
    return { url, port: VSCODE_PORT };
  }

  /** Reconcile wrapper exit without tearing down a live listener. */
  private handleProcessExitOrError(): void {
    this.serverProcess = null;

    const listenerPid = this.resolveManagedListeningPid();
    if (listenerPid !== null) {
      this.writePidFile(listenerPid);
      console.log(
        `[vscode-server] wrapper exited but managed listener ${listenerPid} is still active`,
      );
      return;
    }

    this.folders.clear();
    this.removePidFile();
  }

  /**
   * The fixed port is part of the persisted VS Code login/session identity,
   * so we only reuse a server when the current listener matches Devspace's
   * expected serve-web command line.
   */
  private async assertPortIsAvailableForManagedServer(): Promise<void> {
    if (await isPortFree(VSCODE_PORT)) return;

    throw new Error(
      `Port ${VSCODE_PORT} is already in use. Devspace will only reuse an existing VS Code server at ${VSCODE_SERVER_BASE_PATH} when the current listener matches its managed serve-web process. Close the other process or free the port and try again.`,
    );
  }

  /** Decrement ref count for a folder; stop a spawned server when no consumers remain. */
  release(folder?: string): void {
    const key = folder ?? VscodeServerManager.NO_FOLDER_KEY;
    const entry = this.folders.get(key);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      this.folders.delete(key);
    }

    if (this.folders.size === 0) {
      console.log(`[vscode-server] no remaining consumers, stopping server`);
      this.startLock = this.startLock.then(
        () => this.stopManagedServer(),
        () => this.stopManagedServer(),
      );
    }
  }

  /**
   * Gracefully stop the server (called on app quit).
   *
   * Sends SIGTERM first, waits up to `timeoutMs` for the process to exit,
   * then sends SIGKILL if it's still alive.
   */
  async stopAll(timeoutMs = 2000): Promise<void> {
    this.folders.clear();

    if (this.keepRunning) {
      console.log(`[vscode-server] leaving server running (keepRunning=true)`);
      return;
    }

    await this.stopManagedServer(timeoutMs);
  }

  private writePidFile(pid: number | undefined): void {
    if (pid === undefined) return;
    try {
      writeFileSync(this.pidFilePath, `${pid}\n`, { encoding: "utf-8", mode: 0o600 });
    } catch (err) {
      console.warn("[vscode-server] failed to write pid file:", err);
    }
  }

  private resolveManagedListeningPid(): number | null {
    const listeningPid = getListeningPid(VSCODE_PORT);
    if (listeningPid === null) {
      return null;
    }

    if (!this.isExpectedManagedServerProcess(listeningPid)) {
      return null;
    }

    return listeningPid;
  }

  private isExpectedManagedServerProcess(pid: number): boolean {
    const command = getProcessCommand(pid);
    if (!command) {
      return false;
    }

    return (
      command.includes("code-tunnel serve-web") &&
      command.includes("--host 127.0.0.1") &&
      command.includes(`--port ${VSCODE_PORT}`) &&
      command.includes(`--server-base-path ${VSCODE_SERVER_BASE_PATH}`) &&
      command.includes(`--connection-token-file ${this.connectionTokenFilePath}`) &&
      command.includes(`--server-data-dir ${this.serverDataDir}`)
    );
  }

  private removePidFile(): void {
    try {
      unlinkSync(this.pidFilePath);
    } catch {
      // Already gone or never existed.
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private gracefulKillPid(pid: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        resolve();
        return;
      }

      const deadline = Date.now() + timeoutMs;
      const check = (): void => {
        if (!this.isProcessAlive(pid)) {
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // Already gone.
          }
          resolve();
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  private async stopManagedServer(timeoutMs = 2000): Promise<void> {
    const child = this.serverProcess;
    this.serverProcess = null;
    const listenerPid = this.resolveManagedListeningPid();

    if (child) {
      console.log(`[vscode-server] stopping wrapper process (SIGTERM)`);
      await this.gracefulKill(child, timeoutMs);
    }

    if (listenerPid !== null && listenerPid !== child?.pid) {
      console.log(`[vscode-server] stopping managed listener (pid ${listenerPid})`);
      await this.gracefulKillPid(listenerPid, timeoutMs);
    }

    this.removePidFile();
  }

  private gracefulKill(child: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (): void => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      child.once("exit", done);
      child.kill("SIGTERM");

      setTimeout(() => {
        if (resolved) return;
        try {
          child.kill(0);
          console.log(
            `[vscode-server] process ${child.pid} still alive after ${timeoutMs}ms, sending SIGKILL`,
          );
          child.kill("SIGKILL");
        } catch (err) {
          console.warn("[vscode-server] Process liveness check failed (likely already dead):", err);
        }
        setTimeout(done, 200);
      }, timeoutMs);
    });
  }
}

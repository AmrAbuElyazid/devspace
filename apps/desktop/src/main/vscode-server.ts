import { spawn, execFileSync, execSync, type ChildProcess } from "child_process";
import { createServer } from "net";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { EditorCliStatus } from "../shared/types";
import { VSCODE_PORT, DATA_DIR_SUFFIX } from "./dev-mode";

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

/**
 * Wait for an HTTP server to respond at the given URL.
 * Polls every `intervalMs` up to `timeoutMs`.
 */
function waitForServer(url: string, timeoutMs = 15_000, intervalMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`VS Code server did not start within ${timeoutMs}ms`));
        return;
      }
      fetch(url)
        .then((res) => {
          if (res.ok || res.status === 302 || res.status === 401) resolve();
          else setTimeout(check, intervalMs);
        })
        .catch(() => setTimeout(check, intervalMs));
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
  /** The single shared server process (null when no server is running). */
  private serverProcess: ChildProcess | null = null;
  private serverDataDir: string;

  /**
   * Serialization lock for start().  All calls chain through this promise
   * so only one caller does port acquisition / process spawn at a time.
   */
  private startLock: Promise<unknown> = Promise.resolve();

  /** Whether to leave the server running after app quit (default: true). */
  keepRunning = true;

  constructor(serverDataDir?: string) {
    this.serverDataDir =
      serverDataDir || join(homedir(), ".devspace", `vscode-server-data${DATA_DIR_SUFFIX}`);
    mkdirSync(this.serverDataDir, { recursive: true });
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
   * don't race on port acquisition.  A single `code serve-web` process is
   * shared across all folders — the `?folder=` URL param controls which
   * workspace the VS Code client opens.
   *
   * When called without a folder, the server starts (or is reused) and
   * returns the base URL — VS Code shows its Welcome tab.
   */
  async start(folder?: string, configuredCli?: string): Promise<{ url: string; port: number }> {
    // Serialize: chain onto the lock so only one caller runs _startImpl at a time.
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

    // Fast path: folder already has an entry → just bump refCount.
    const existing = this.folders.get(key);
    if (existing) {
      existing.refCount++;
      return { url: existing.url, port: VSCODE_PORT };
    }

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

    const cli = resolvedCli.path;

    // If a server process is already running, reuse it for this folder.
    if (this.serverProcess) {
      return this.addFolder(key, folder);
    }

    // Try to reuse a server left running from a previous session.
    if (await this.reuseRunningServer()) {
      return this.addFolder(key, folder);
    }

    // No server running — acquire the port (possibly killing a stale process).
    await this.acquirePort();

    // Spawn the server.
    const child = spawn(
      cli,
      [
        "serve-web",
        "--host",
        "127.0.0.1",
        "--port",
        String(VSCODE_PORT),
        "--without-connection-token",
        "--accept-server-license-terms",
        "--server-data-dir",
        this.serverDataDir,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      },
    );

    // Log stderr for debugging
    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[vscode-server:${VSCODE_PORT}] ${msg}`);
    });

    child.on("error", (err) => {
      console.error(`[vscode-server:${VSCODE_PORT}] process error:`, err);
      this.handleProcessDeath();
    });

    child.on("exit", (code) => {
      console.log(`[vscode-server:${VSCODE_PORT}] exited with code ${code}`);
      this.handleProcessDeath();
    });

    this.serverProcess = child;

    try {
      await waitForServer(`http://127.0.0.1:${VSCODE_PORT}`);
    } catch (err) {
      child.kill();
      this.serverProcess = null;
      throw err;
    }

    console.log(`[vscode-server] started on port ${VSCODE_PORT}`);
    return this.addFolder(key, folder);
  }

  /**
   * Probe port 18562 for a responsive VS Code server left running from
   * a previous session.  Returns true if found and adopted.
   */
  private async reuseRunningServer(): Promise<boolean> {
    if (await isPortFree(VSCODE_PORT)) return false;

    try {
      await waitForServer(`http://127.0.0.1:${VSCODE_PORT}`, 3000, 200);
      console.log(`[vscode-server] reusing existing server on port ${VSCODE_PORT}`);
      return true;
    } catch (err) {
      console.warn("[vscode-server] Reuse check for existing server failed:", err);
      return false;
    }
  }

  /** Create a folder entry pointing at the shared server. */
  private addFolder(key: string, folder?: string): { url: string; port: number } {
    const url = folder
      ? `http://127.0.0.1:${VSCODE_PORT}?folder=${encodeURIComponent(folder)}`
      : `http://127.0.0.1:${VSCODE_PORT}`;
    this.folders.set(key, { url, refCount: 1 });
    console.log(`[vscode-server] serving ${folder ?? "(no folder)"}`);
    return { url, port: VSCODE_PORT };
  }

  /** Clean up state when the server process dies unexpectedly. */
  private handleProcessDeath(): void {
    this.serverProcess = null;
    this.folders.clear();
  }

  /**
   * Free up the fixed port by killing any stale process occupying it.
   * Tries graceful SIGTERM first, then SIGKILL as a last resort.
   * Only called when we know no managed server process is running.
   */
  private async acquirePort(): Promise<void> {
    if (await isPortFree(VSCODE_PORT)) return;

    console.log(`[vscode-server] port ${VSCODE_PORT} busy, sending SIGTERM to stale process...`);
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill 2>/dev/null`, { stdio: "ignore" });
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await isPortFree(VSCODE_PORT)) return;
      }
    } catch (err) {
      console.warn("[vscode-server] SIGTERM to stale process failed:", err);
    }

    if (await isPortFree(VSCODE_PORT)) return;

    console.log(`[vscode-server] port ${VSCODE_PORT} still busy after SIGTERM, sending SIGKILL...`);
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      console.warn("[vscode-server] SIGKILL to stale process failed:", err);
    }

    if (!(await isPortFree(VSCODE_PORT))) {
      throw new Error(
        `Port ${VSCODE_PORT} is occupied and could not be freed. Check: lsof -i:${VSCODE_PORT}`,
      );
    }
  }

  /** Decrement ref count for a folder; stop server when no consumers remain. */
  release(folder?: string): void {
    const key = folder ?? VscodeServerManager.NO_FOLDER_KEY;
    const entry = this.folders.get(key);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      this.folders.delete(key);
    }

    // If no folders remain, kill the server.
    if (this.folders.size === 0 && this.serverProcess) {
      console.log(`[vscode-server] no remaining consumers, stopping server`);
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  /**
   * Gracefully stop the server (called on app quit).
   *
   * Sends SIGTERM first, waits up to `timeoutMs` for the process to exit,
   * then sends SIGKILL if it's still alive.
   */
  async stopAll(timeoutMs = 2000): Promise<void> {
    const child = this.serverProcess;
    this.serverProcess = null;
    this.folders.clear();

    if (this.keepRunning) {
      console.log(`[vscode-server] leaving server running (keepRunning=true)`);
      return;
    }

    // Kill the child process we spawned (if any).
    if (child) {
      console.log(`[vscode-server] stopping server (SIGTERM)`);
      await this.gracefulKill(child, timeoutMs);
    }

    // Kill anything still listening on the port — covers both orphaned
    // code-tunn children and servers we reused but never spawned ourselves.
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
      console.log(`[vscode-server] killed remaining processes on port ${VSCODE_PORT}`);
    } catch (err) {
      console.warn("[vscode-server] Killing remaining processes on port failed:", err);
    }
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
          child.kill(0); // throws if already dead
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

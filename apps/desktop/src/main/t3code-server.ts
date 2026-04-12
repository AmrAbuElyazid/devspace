import { spawn, execFileSync, type ChildProcess } from "child_process";
import { createServer } from "net";
import { homedir } from "os";
import { T3CODE_PORT_BASE } from "./dev-mode";

/**
 * Manages a single shared T3 Code server instance.
 *
 * T3 Code handles project management internally via its own UI, so we
 * don't need per-folder instances.  A single server is shared across all
 * T3 Code panes, reference-counted so it's stopped when no panes remain.
 */

/**
 * Check if a port is available by trying to bind to it.
 * Binds on 0.0.0.0 so we detect listeners on any address family
 * (the t3 CLI listens on `::` which may cover both IPv4 and IPv6).
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

/** Get the PID listening on a TCP port, or null. */
function getListeningPid(port: number): number | null {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number.parseInt(output.split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

/** Check whether a PID belongs to a `t3` process. */
function isT3Process(pid: number): boolean {
  try {
    const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /(?:^|\/)t3(?:\s|$)/.test(cmd);
  } catch {
    return false;
  }
}

/**
 * Find an available port starting from a base.
 * When a port is occupied by a stale t3 process (orphaned from a
 * previous session), kill it and reclaim the port.
 */
async function findFreePort(startFrom = T3CODE_PORT_BASE): Promise<number> {
  for (let port = startFrom; port < startFrom + 100; port++) {
    if (await isPortFree(port)) return port;

    // Port is occupied — check for a stale t3 process we can reclaim.
    const pid = getListeningPid(port);
    if (pid !== null && isT3Process(pid)) {
      console.log(`[t3code] killing stale t3 process (pid ${pid}) on port ${port}`);
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (await isPortFree(port)) return port;
    }
  }
  throw new Error("Could not find a free port for T3 Code server");
}

/** Locate the `t3` CLI. Returns the path or null. */
function findT3Cli(): string | null {
  for (const cmd of ["t3", `${process.env.HOME}/.bun/bin/t3`]) {
    try {
      const resolved = execFileSync("which", [cmd], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (resolved) return resolved;
    } catch {
      // Not found via this candidate, try next.
    }
  }
  return null;
}

/**
 * Wait for an HTTP server to respond at the given URL.
 * Polls every `intervalMs` up to `timeoutMs`.
 *
 * Any HTTP response (regardless of status code) is treated as "server is
 * ready" — authentication and pairing are handled later by the browser pane.
 * Each fetch attempt has its own abort timeout so a server that accepts the
 * TCP connection but never sends a response cannot block the poll loop.
 */
function waitForServer(url: string, timeoutMs = 20_000, intervalMs = 400): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`T3 Code server did not start within ${timeoutMs}ms`));
        return;
      }
      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 2000);
      fetch(url, { signal: controller.signal, redirect: "manual" })
        .then(() => {
          clearTimeout(fetchTimer);
          resolve();
        })
        .catch(() => {
          clearTimeout(fetchTimer);
          setTimeout(check, intervalMs);
        });
    };
    check();
  });
}

export class T3CodeServerManager {
  private serverProcess: ChildProcess | null = null;
  private url: string | null = null;
  private refCount = 0;

  private t3Cli: string | null = null;
  private t3CliChecked = false;

  /** Serialization lock — only one caller spawns at a time. */
  private startLock: Promise<unknown> = Promise.resolve();

  private getT3Cli(): string | null {
    if (!this.t3CliChecked) {
      this.t3Cli = findT3Cli();
      this.t3CliChecked = true;
    }
    return this.t3Cli;
  }

  /** Check if T3 Code CLI is available. */
  isAvailable(): boolean {
    return this.getT3Cli() !== null;
  }

  /**
   * Start (or reuse) the shared T3 Code server.
   * Returns the URL to load in a WebContentsView.
   */
  async start(): Promise<{ url: string }> {
    const result = new Promise<{ url: string }>((resolve, reject) => {
      this.startLock = this.startLock.then(
        () => this._startImpl().then(resolve, reject),
        () => this._startImpl().then(resolve, reject),
      );
    });
    return result;
  }

  private async _startImpl(): Promise<{ url: string }> {
    // Fast path: server already running.  Subsequent panes share the
    // browser session so the existing pairing cookie authenticates them.
    if (this.serverProcess && this.url) {
      this.refCount++;
      return { url: this.url };
    }

    const cli = this.getT3Cli();
    if (!cli) {
      throw new Error("T3 Code CLI (t3) not found. Install it with: npm install -g t3");
    }

    const port = await findFreePort();

    const child = spawn(cli, ["--port", String(port), "--no-browser"], {
      cwd: homedir(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      env: {
        ...process.env,
      },
    });

    // Capture stdout/stderr during startup.
    // - stdout is parsed for the pairing URL the t3 CLI emits.
    // - stderr is captured for actionable error messages on failure.
    // Both are forwarded to the parent's stdio for dev-log visibility.
    const stderrChunks: Buffer[] = [];
    let captureOutput = true;
    let pairingUrl: string | null = null;
    let onPairingUrl: (() => void) | null = null;

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      if (!captureOutput || pairingUrl) return;
      const text = chunk.toString("utf-8");
      // Match the pairingUrl from pino output (JSON or pretty-printed).
      // JSON:   "pairingUrl":"http://localhost:18670/pair#token=..."
      // Pretty:  pairingUrl: http://localhost:18670/pair#token=...
      const match = text.match(/pairingUrl[":]*\s*"?(https?:\/\/[^\s"]+)/);
      if (match?.[1]) {
        pairingUrl = match[1];
        onPairingUrl?.();
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      if (captureOutput) stderrChunks.push(chunk);
    });

    const healthCheckUrl = `http://127.0.0.1:${port}`;

    // Race three signals: pairing URL parsed from stdout (preferred),
    // server health-check (fallback), or early process death (error).
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const succeed = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        const fail = (err: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };

        const onExit = (code: number | null): void => {
          const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
          const detail = stderr.split("\n").find((l) => l.includes("Error")) ?? "";
          fail(
            new Error(
              `T3 Code process exited with code ${code} before becoming ready` +
                (detail ? `: ${detail}` : ""),
            ),
          );
        };

        const onError = (err: Error): void => {
          fail(new Error(`T3 Code process failed to start: ${err.message}`));
        };

        const cleanup = (): void => {
          child.removeListener("exit", onExit);
          child.removeListener("error", onError);
          onPairingUrl = null;
        };

        child.once("exit", onExit);
        child.once("error", onError);

        // Pairing URL from stdout resolves immediately — this is the
        // preferred signal because it also gives us the auth token.
        onPairingUrl = succeed;
        if (pairingUrl) succeed(); // already captured before we got here

        // Fallback: HTTP health-check for servers that don't emit a
        // pairing URL (e.g. unauthenticated mode).
        waitForServer(healthCheckUrl).then(succeed, fail);
      });
    } catch (err) {
      captureOutput = false;
      child.kill();
      throw err;
    }

    captureOutput = false;
    stderrChunks.length = 0;

    // Use localhost (not 127.0.0.1) so the browser session's pairing
    // cookie domain matches the origin the t3 server advertises.
    const baseUrl = `http://localhost:${port}`;

    // First pane gets the pairing URL so the embedded browser
    // auto-authenticates via the one-time token in the hash.
    // Subsequent panes (fast-path above) reuse baseUrl — the shared
    // browser session already carries the pairing cookie.
    const url = pairingUrl ?? baseUrl;

    // Runtime event handlers — only installed after successful startup.
    child.on("exit", (code) => {
      console.log(`[t3code:${port}] exited with code ${code}`);
      this.handleProcessDeath();
    });
    child.on("error", (err) => {
      console.error(`[t3code:${port}] process error:`, err);
      this.handleProcessDeath();
    });

    console.log(
      `[t3code] started on port ${port} (pairing URL ${pairingUrl ? "captured" : "not found, using base URL"})`,
    );

    this.serverProcess = child;
    this.url = baseUrl;
    this.refCount = 1;

    return { url };
  }

  private handleProcessDeath(): void {
    this.serverProcess = null;
    this.url = null;
    this.refCount = 0;
  }

  /** Decrement ref count; stop server when no panes remain. */
  release(): void {
    this.refCount--;
    if (this.refCount <= 0 && this.serverProcess) {
      console.log(`[t3code] no remaining panes, stopping server`);
      this.serverProcess.kill();
      this.serverProcess = null;
      this.url = null;
      this.refCount = 0;
    }
  }

  /** Gracefully stop the server (called on app quit). */
  async stopAll(timeoutMs = 2000): Promise<void> {
    const child = this.serverProcess;
    this.serverProcess = null;
    this.url = null;
    this.refCount = 0;

    if (child) {
      console.log(`[t3code] stopping server (SIGTERM)`);
      await this.gracefulKill(child, timeoutMs);
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
          child.kill(0);
          console.log(
            `[t3code] process ${child.pid} still alive after ${timeoutMs}ms, sending SIGKILL`,
          );
          child.kill("SIGKILL");
        } catch (err) {
          console.warn("[t3code-server] Process liveness check failed (likely already dead):", err);
        }
        setTimeout(done, 200);
      }, timeoutMs);
    });
  }
}

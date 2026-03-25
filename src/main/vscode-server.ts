import { spawn, execSync, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * Fixed port for all VS Code serve-web instances.  Using a single stable
 * port guarantees the browser origin (http://127.0.0.1:PORT) never changes,
 * which means localStorage, IndexedDB, and cookies persist across app
 * restarts — critical for keeping the user logged in to Settings Sync.
 *
 * `code serve-web` is folder-agnostic — the `?folder=` URL param tells the
 * VS Code client which folder to open, so a single server process can serve
 * any number of editor panes for different folders.
 */
const VSCODE_PORT = 18562

/** Check if a port is available by trying to bind to it. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

/** Locate the `code` CLI. Returns the path or null. */
function findCodeCli(): string | null {
  try {
    return execSync('which code', { encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

/**
 * Wait for an HTTP server to respond at the given URL.
 * Polls every `intervalMs` up to `timeoutMs`.
 */
function waitForServer(url: string, timeoutMs = 15_000, intervalMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`VS Code server did not start within ${timeoutMs}ms`))
        return
      }
      fetch(url)
        .then((res) => {
          if (res.ok || res.status === 302 || res.status === 401) resolve()
          else setTimeout(check, intervalMs)
        })
        .catch(() => setTimeout(check, intervalMs))
    }
    check()
  })
}

interface FolderEntry {
  url: string
  refCount: number
}

export class VscodeServerManager {
  /** Per-folder URL entries with reference counting. */
  private folders = new Map<string, FolderEntry>()
  /** The single shared server process (null when no server is running). */
  private serverProcess: ChildProcess | null = null

  private codeCli: string | null = null
  private codeCliChecked = false
  private serverDataDir: string

  /**
   * Serialization lock for start().  All calls chain through this promise
   * so only one caller does port acquisition / process spawn at a time.
   */
  private startLock: Promise<unknown> = Promise.resolve()

  /** Whether to leave the server running after app quit (default: true). */
  keepRunning = true

  constructor(serverDataDir?: string) {
    this.serverDataDir = serverDataDir || join(homedir(), '.devspace', 'vscode-server-data')
    mkdirSync(this.serverDataDir, { recursive: true })
  }

  /** Resolve the `code` CLI path (cached). */
  private getCodeCli(): string | null {
    if (!this.codeCliChecked) {
      this.codeCli = findCodeCli()
      this.codeCliChecked = true
    }
    return this.codeCli
  }

  /** Check if VS Code CLI is available. */
  isAvailable(): boolean {
    return this.getCodeCli() !== null
  }

  /**
   * Start (or reuse) a `code serve-web` server for the given folder.
   *
   * All calls are serialized so concurrent requests for different folders
   * don't race on port acquisition.  A single `code serve-web` process is
   * shared across all folders — the `?folder=` URL param controls which
   * workspace the VS Code client opens.
   */
  async start(folder: string): Promise<{ url: string; port: number }> {
    // Serialize: chain onto the lock so only one caller runs _startImpl at a time.
    const result = new Promise<{ url: string; port: number }>((resolve, reject) => {
      this.startLock = this.startLock.then(
        () => this._startImpl(folder).then(resolve, reject),
        () => this._startImpl(folder).then(resolve, reject),
      )
    })
    return result
  }

  private async _startImpl(folder: string): Promise<{ url: string; port: number }> {
    // Fast path: folder already has an entry → just bump refCount.
    const existing = this.folders.get(folder)
    if (existing) {
      existing.refCount++
      return { url: existing.url, port: VSCODE_PORT }
    }

    const cli = this.getCodeCli()
    if (!cli) {
      throw new Error('VS Code CLI (code) not found. Install VS Code and ensure the "code" command is in PATH.')
    }

    // If a server process is already running, reuse it for this folder.
    if (this.serverProcess) {
      return this.addFolder(folder)
    }

    // Try to reuse a server left running from a previous session.
    if (await this.reuseRunningServer()) {
      return this.addFolder(folder)
    }

    // No server running — acquire the port (possibly killing a stale process).
    await this.acquirePort()

    // Spawn the server.
    const child = spawn(cli, [
      'serve-web',
      '--host', '127.0.0.1',
      '--port', String(VSCODE_PORT),
      '--without-connection-token',
      '--accept-server-license-terms',
      '--server-data-dir', this.serverDataDir,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    // Log stderr for debugging
    child.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) console.log(`[vscode-server:${VSCODE_PORT}] ${msg}`)
    })

    child.on('error', (err) => {
      console.error(`[vscode-server:${VSCODE_PORT}] process error:`, err)
      this.handleProcessDeath()
    })

    child.on('exit', (code) => {
      console.log(`[vscode-server:${VSCODE_PORT}] exited with code ${code}`)
      this.handleProcessDeath()
    })

    this.serverProcess = child

    try {
      await waitForServer(`http://127.0.0.1:${VSCODE_PORT}`)
    } catch (err) {
      child.kill()
      this.serverProcess = null
      throw err
    }

    console.log(`[vscode-server] started on port ${VSCODE_PORT}`)
    return this.addFolder(folder)
  }

  /**
   * Probe port 18562 for a responsive VS Code server left running from
   * a previous session.  Returns true if found and adopted.
   */
  private async reuseRunningServer(): Promise<boolean> {
    if (await isPortFree(VSCODE_PORT)) return false

    try {
      await waitForServer(`http://127.0.0.1:${VSCODE_PORT}`, 3000, 200)
      console.log(`[vscode-server] reusing existing server on port ${VSCODE_PORT}`)
      return true
    } catch {
      return false
    }
  }

  /** Create a folder entry pointing at the shared server. */
  private addFolder(folder: string): { url: string; port: number } {
    const url = `http://127.0.0.1:${VSCODE_PORT}?folder=${encodeURIComponent(folder)}`
    this.folders.set(folder, { url, refCount: 1 })
    console.log(`[vscode-server] serving folder ${folder}`)
    return { url, port: VSCODE_PORT }
  }

  /** Clean up state when the server process dies unexpectedly. */
  private handleProcessDeath(): void {
    this.serverProcess = null
    this.folders.clear()
  }

  /**
   * Free up the fixed port by killing any stale process occupying it.
   * Tries graceful SIGTERM first, then SIGKILL as a last resort.
   * Only called when we know no managed server process is running.
   */
  private async acquirePort(): Promise<void> {
    if (await isPortFree(VSCODE_PORT)) return

    console.log(`[vscode-server] port ${VSCODE_PORT} busy, sending SIGTERM to stale process...`)
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill 2>/dev/null`, { stdio: 'ignore' })
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        if (await isPortFree(VSCODE_PORT)) return
      }
    } catch {
      // Ignore — might not have anything to kill
    }

    if (await isPortFree(VSCODE_PORT)) return

    console.log(`[vscode-server] port ${VSCODE_PORT} still busy after SIGTERM, sending SIGKILL...`)
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch {
      // Ignore
    }

    if (!(await isPortFree(VSCODE_PORT))) {
      throw new Error(`Port ${VSCODE_PORT} is occupied and could not be freed. Check: lsof -i:${VSCODE_PORT}`)
    }
  }

  /** Decrement ref count for a folder; stop server when no consumers remain. */
  release(folder: string): void {
    const entry = this.folders.get(folder)
    if (!entry) return

    entry.refCount--
    if (entry.refCount <= 0) {
      this.folders.delete(folder)
    }

    // If no folders remain, kill the server.
    if (this.folders.size === 0 && this.serverProcess) {
      console.log(`[vscode-server] no remaining consumers, stopping server`)
      this.serverProcess.kill()
      this.serverProcess = null
    }
  }

  /**
   * Gracefully stop the server (called on app quit).
   *
   * Sends SIGTERM first, waits up to `timeoutMs` for the process to exit,
   * then sends SIGKILL if it's still alive.
   */
  async stopAll(timeoutMs = 2000): Promise<void> {
    const child = this.serverProcess
    this.serverProcess = null
    this.folders.clear()

    if (this.keepRunning) {
      console.log(`[vscode-server] leaving server running (keepRunning=true)`)
      return
    }

    // Kill the child process we spawned (if any).
    if (child) {
      console.log(`[vscode-server] stopping server (SIGTERM)`)
      await this.gracefulKill(child, timeoutMs)
    }

    // Kill anything still listening on the port — covers both orphaned
    // code-tunn children and servers we reused but never spawned ourselves.
    try {
      execSync(`lsof -ti:${VSCODE_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      console.log(`[vscode-server] killed remaining processes on port ${VSCODE_PORT}`)
    } catch {
      // Ignore — nothing to kill
    }
  }

  private gracefulKill(child: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false
      const done = (): void => {
        if (resolved) return
        resolved = true
        resolve()
      }

      child.once('exit', done)
      child.kill('SIGTERM')

      setTimeout(() => {
        if (resolved) return
        try {
          child.kill(0) // throws if already dead
          console.log(`[vscode-server] process ${child.pid} still alive after ${timeoutMs}ms, sending SIGKILL`)
          child.kill('SIGKILL')
        } catch {
          // Already dead
        }
        setTimeout(done, 200)
      }, timeoutMs)
    })
  }
}

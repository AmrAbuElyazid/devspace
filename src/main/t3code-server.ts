import { spawn, execSync, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { homedir } from 'os'
import { T3CODE_PORT_BASE } from './dev-mode'

/**
 * Manages a single shared T3 Code server instance.
 *
 * T3 Code handles project management internally via its own UI, so we
 * don't need per-folder instances.  A single server is shared across all
 * T3 Code panes, reference-counted so it's stopped when no panes remain.
 */

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

/** Find an available port starting from a base. */
async function findFreePort(startFrom = T3CODE_PORT_BASE): Promise<number> {
  for (let port = startFrom; port < startFrom + 100; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error('Could not find a free port for T3 Code server')
}

/** Locate the `t3` CLI. Returns the path or null. */
function findT3Cli(): string | null {
  for (const cmd of ['t3', `${process.env.HOME}/.bun/bin/t3`]) {
    try {
      const resolved = execSync(`which ${cmd}`, { encoding: 'utf-8' }).trim()
      if (resolved) return resolved
    } catch {
      // continue
    }
  }
  return null
}

/**
 * Wait for an HTTP server to respond at the given URL.
 * Polls every `intervalMs` up to `timeoutMs`.
 */
function waitForServer(url: string, timeoutMs = 20_000, intervalMs = 400): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`T3 Code server did not start within ${timeoutMs}ms`))
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

export class T3CodeServerManager {
  private serverProcess: ChildProcess | null = null
  private url: string | null = null
  private refCount = 0

  private t3Cli: string | null = null
  private t3CliChecked = false

  /** Serialization lock — only one caller spawns at a time. */
  private startLock: Promise<unknown> = Promise.resolve()

  private getT3Cli(): string | null {
    if (!this.t3CliChecked) {
      this.t3Cli = findT3Cli()
      this.t3CliChecked = true
    }
    return this.t3Cli
  }

  /** Check if T3 Code CLI is available. */
  isAvailable(): boolean {
    return this.getT3Cli() !== null
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
      )
    })
    return result
  }

  private async _startImpl(): Promise<{ url: string }> {
    // Fast path: server already running.
    if (this.serverProcess && this.url) {
      this.refCount++
      return { url: this.url }
    }

    const cli = this.getT3Cli()
    if (!cli) {
      throw new Error(
        'T3 Code CLI (t3) not found. Install it with: npm install -g t3'
      )
    }

    const port = await findFreePort()

    const child = spawn(cli, [
      '--port', String(port),
      '--no-browser',
    ], {
      cwd: homedir(),
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false,
      env: {
        ...process.env,
      },
    })

    child.on('error', (err) => {
      console.error(`[t3code:${port}] process error:`, err)
      this.handleProcessDeath()
    })

    child.on('exit', (code) => {
      console.log(`[t3code:${port}] exited with code ${code}`)
      this.handleProcessDeath()
    })

    const url = `http://127.0.0.1:${port}`

    try {
      await waitForServer(url)
    } catch (err) {
      child.kill()
      throw err
    }

    console.log(`[t3code] started on port ${port}`)

    this.serverProcess = child
    this.url = url
    this.refCount = 1

    return { url }
  }

  private handleProcessDeath(): void {
    this.serverProcess = null
    this.url = null
    this.refCount = 0
  }

  /** Decrement ref count; stop server when no panes remain. */
  release(): void {
    this.refCount--
    if (this.refCount <= 0 && this.serverProcess) {
      console.log(`[t3code] no remaining panes, stopping server`)
      this.serverProcess.kill()
      this.serverProcess = null
      this.url = null
      this.refCount = 0
    }
  }

  /** Gracefully stop the server (called on app quit). */
  async stopAll(timeoutMs = 2000): Promise<void> {
    const child = this.serverProcess
    this.serverProcess = null
    this.url = null
    this.refCount = 0

    if (child) {
      console.log(`[t3code] stopping server (SIGTERM)`)
      await this.gracefulKill(child, timeoutMs)
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
          child.kill(0)
          console.log(`[t3code] process ${child.pid} still alive after ${timeoutMs}ms, sending SIGKILL`)
          child.kill('SIGKILL')
        } catch {
          // Already dead
        }
        setTimeout(done, 200)
      }, timeoutMs)
    })
  }
}

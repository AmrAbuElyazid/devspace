import { spawn, execSync, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface ServerInstance {
  process: ChildProcess
  url: string
  port: number
  folder: string
  refCount: number
}

/**
 * Derive a deterministic port from a folder path so the same folder always
 * maps to the same origin (http://127.0.0.1:PORT). This preserves the
 * browser's IndexedDB across sessions — VS Code web settings, extensions,
 * login state, and theme all persist.
 *
 * Range: 9100-9899 (800 slots, plenty for concurrent folders).
 */
function stablePortForFolder(folder: string): number {
  let hash = 0
  for (let i = 0; i < folder.length; i++) {
    hash = ((hash << 5) - hash + folder.charCodeAt(i)) | 0
  }
  return 9100 + (Math.abs(hash) % 800)
}

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

export class VscodeServerManager {
  private servers = new Map<string, ServerInstance>()
  private codeCli: string | null = null
  private codeCliChecked = false
  private serverDataDir: string

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
   * Uses a deterministic port per folder to preserve IndexedDB state
   * (settings, extensions, login) across sessions.
   */
  async start(folder: string): Promise<{ url: string; port: number }> {
    const existing = this.servers.get(folder)
    if (existing) {
      existing.refCount++
      return { url: existing.url, port: existing.port }
    }

    const cli = this.getCodeCli()
    if (!cli) {
      throw new Error('VS Code CLI (code) not found. Install VS Code and ensure the "code" command is in PATH.')
    }

    // Use a stable port for this folder. If it's occupied (hash collision
    // or leftover process), fall back to adjacent ports.
    let port = stablePortForFolder(folder)
    let found = false
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await isPortFree(port + attempt)) {
        port = port + attempt
        found = true
        break
      }
    }
    if (!found) {
      throw new Error(`No free port found near ${port} for folder: ${folder}`)
    }

    const url = `http://127.0.0.1:${port}?folder=${encodeURIComponent(folder)}`

    const child = spawn(cli, [
      'serve-web',
      '--host', '127.0.0.1',
      '--port', String(port),
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
      if (msg) console.log(`[vscode-server:${port}] ${msg}`)
    })

    child.on('error', (err) => {
      console.error(`[vscode-server:${port}] process error:`, err)
      this.servers.delete(folder)
    })

    child.on('exit', (code) => {
      console.log(`[vscode-server:${port}] exited with code ${code}`)
      this.servers.delete(folder)
    })

    const instance: ServerInstance = {
      process: child,
      url,
      port,
      folder,
      refCount: 1,
    }
    this.servers.set(folder, instance)

    try {
      await waitForServer(`http://127.0.0.1:${port}`)
    } catch (err) {
      // Cleanup on timeout
      child.kill()
      this.servers.delete(folder)
      throw err
    }

    console.log(`[vscode-server] started on port ${port} for ${folder}`)
    return { url, port }
  }

  /** Decrement ref count for a folder; kill server when no consumers remain. */
  release(folder: string): void {
    const instance = this.servers.get(folder)
    if (!instance) return

    instance.refCount--
    if (instance.refCount <= 0) {
      console.log(`[vscode-server] stopping server for ${folder}`)
      instance.process.kill()
      this.servers.delete(folder)
    }
  }

  /** Kill all running servers (called on app quit). */
  stopAll(): void {
    for (const [folder, instance] of this.servers) {
      console.log(`[vscode-server] stopping server for ${folder}`)
      instance.process.kill()
    }
    this.servers.clear()
  }
}

import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { nanoid } from 'nanoid'
import { chmodSync, existsSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import type { PtyCreateOptions } from '../shared/types'

// Ensure spawn-helper is executable (bun doesn't run postinstall scripts that set this)
function ensureSpawnHelperExecutable(): void {
  try {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const platform = process.platform
    const candidates = [
      join(dirname(require.resolve('node-pty')), '..', 'prebuilds', `${platform}-${arch}`, 'spawn-helper'),
      join(dirname(require.resolve('node-pty')), '..', 'build', 'Release', 'spawn-helper'),
    ]
    for (const p of candidates) {
      try {
        chmodSync(p, 0o755)
      } catch {
        // candidate doesn't exist, try next
      }
    }
  } catch {
    // best-effort
  }
}
ensureSpawnHelperExecutable()

export class PtyManager {
  private sessions = new Map<string, IPty>()
  private dataListeners = new Set<(ptyId: string, data: string) => void>()
  private exitListeners = new Set<(ptyId: string, exitCode: number) => void>()
  private killEscalationTimers = new Map<string, NodeJS.Timeout>()
  private readonly KILL_GRACE_MS = 3000

  private readonly ENV_BLOCKLIST = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ASAR',
    'GOOGLE_API_KEY',
    'GOOGLE_DEFAULT_CLIENT_ID',
    'GOOGLE_DEFAULT_CLIENT_SECRET',
  ])

  private readonly ENV_PREFIX_BLOCKLIST = ['ELECTRON_', 'VITE_', 'DEVSPACE_']

  create(options: PtyCreateOptions): string {
    const { shell, args } = this.resolveShell(options.shell)
    const cwd = this.validateCwd(options.cwd)
    const env = this.getTerminalEnv()
    const ptyId = nanoid()

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd,
      env,
    })

    this.sessions.set(ptyId, ptyProcess)

    ptyProcess.onData((data) => {
      for (const listener of this.dataListeners) {
        listener(ptyId, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.clearKillTimer(ptyId)
      for (const listener of this.exitListeners) {
        listener(ptyId, exitCode)
      }
      this.sessions.delete(ptyId)
    })

    return ptyId
  }

  write(ptyId: string, data: string): void {
    this.sessions.get(ptyId)?.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    this.sessions.get(ptyId)?.resize(cols, rows)
  }

  destroy(ptyId: string): void {
    const session = this.sessions.get(ptyId)
    if (!session) return

    this.clearKillTimer(ptyId)

    try {
      session.kill('SIGTERM')
    } catch (error) {
      console.error(`[PTY] Failed to SIGTERM ${ptyId}:`, error)
      this.sessions.delete(ptyId)
      return
    }

    const timer = setTimeout(() => {
      this.killEscalationTimers.delete(ptyId)
      try {
        session.kill('SIGKILL')
      } catch (error) {
        console.error(`[PTY] Failed to SIGKILL ${ptyId}:`, error)
      }
      this.sessions.delete(ptyId)
    }, this.KILL_GRACE_MS)

    timer.unref?.()
    this.killEscalationTimers.set(ptyId, timer)
  }

  destroyAll(): void {
    for (const [ptyId] of this.sessions) {
      this.destroy(ptyId)
    }
  }

  onData(callback: (ptyId: string, data: string) => void): () => void {
    this.dataListeners.add(callback)
    return () => this.dataListeners.delete(callback)
  }

  onExit(callback: (ptyId: string, exitCode: number) => void): () => void {
    this.exitListeners.add(callback)
    return () => this.exitListeners.delete(callback)
  }

  private clearKillTimer(ptyId: string): void {
    const timer = this.killEscalationTimers.get(ptyId)
    if (timer) {
      clearTimeout(timer)
      this.killEscalationTimers.delete(ptyId)
    }
  }

  private resolveShell(requested?: string): { shell: string; args: string[] } {
    const candidates = [
      requested,
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter(Boolean) as string[]

    for (const shell of candidates) {
      try {
        if (existsSync(shell)) {
          const name = basename(shell)
          const args = name === 'zsh' ? ['-o', 'nopromptsp'] : []
          return { shell, args }
        }
      } catch {
        continue
      }
    }

    return { shell: '/bin/sh', args: [] }
  }

  private getTerminalEnv(extraEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue
      if (this.ENV_BLOCKLIST.has(key)) continue
      if (this.ENV_PREFIX_BLOCKLIST.some((p) => key.startsWith(p))) continue
      env[key] = value
    }
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    if (extraEnv) Object.assign(env, extraEnv)
    return env
  }

  private validateCwd(cwd?: string): string {
    if (cwd) {
      try {
        const stat = statSync(cwd)
        if (stat.isDirectory()) return cwd
      } catch {
        console.warn(`[PTY] CWD does not exist: ${cwd}, falling back to home`)
      }
    }
    return process.env.HOME || '/'
  }
}

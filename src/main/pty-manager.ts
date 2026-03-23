import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { nanoid } from 'nanoid'
import type { PtyCreateOptions } from '../shared/types'

export class PtyManager {
  private sessions = new Map<string, IPty>()
  private dataListeners = new Set<(ptyId: string, data: string) => void>()
  private exitListeners = new Set<(ptyId: string, exitCode: number) => void>()

  create(options: PtyCreateOptions): string {
    const defaultShell =
      process.platform === 'win32'
        ? 'cmd.exe'
        : process.env.SHELL || '/bin/zsh'

    const shell = options.shell || defaultShell
    const cwd = options.cwd || process.env.HOME || '/'
    const ptyId = nanoid()

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      } as Record<string, string>
    })

    this.sessions.set(ptyId, ptyProcess)

    ptyProcess.onData((data) => {
      for (const listener of this.dataListeners) {
        listener(ptyId, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
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
    if (session) {
      session.kill()
      this.sessions.delete(ptyId)
    }
  }

  destroyAll(): void {
    for (const [ptyId, session] of this.sessions) {
      session.kill()
      this.sessions.delete(ptyId)
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
}

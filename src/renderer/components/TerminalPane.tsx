import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { useWorkspaceStore } from '../store/workspace-store'
import type { TerminalConfig } from '../types/workspace'

function getTerminalTheme() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: style.getPropertyValue('--background').trim() || '#0a0a0f',
    foreground: style.getPropertyValue('--foreground').trim() || '#ececf1',
    cursor: style.getPropertyValue('--foreground').trim() || '#ececf1',
    cursorAccent: style.getPropertyValue('--background').trim() || '#0a0a0f',
    selectionBackground: 'rgba(255, 255, 255, 0.15)',
    selectionForeground: undefined,
    black: '#1e1e2e',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: '#cdd6f4',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: '#ffffff',
  }
}

interface TerminalPaneProps {
  paneId: string
  config: TerminalConfig
}

export default function TerminalPane({ paneId, config }: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const initedRef = useRef(false)

  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)

  const initTerminal = useCallback(async () => {
    if (initedRef.current || !containerRef.current) return
    initedRef.current = true

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily:
        "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      scrollback: 5000,
      theme: getTerminalTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.open(containerRef.current)

    // Initial fit to get dimensions
    fitAddon.fit()
    const cols = terminal.cols
    const rows = terminal.rows

    // Spawn PTY
    let ptyId: string
    try {
      ptyId = await window.api.pty.create({
        cols,
        rows,
        cwd: config.cwd,
        shell: config.shell,
      })
    } catch (err) {
      terminal.write(
        `\r\n\x1b[31m[Failed to create terminal: ${err instanceof Error ? err.message : String(err)}]\x1b[0m\r\n`,
      )
      return
    }

    ptyIdRef.current = ptyId
    updatePaneConfig(paneId, { ptyId })

    // Data flow: PTY -> terminal
    const cleanupOnData = window.api.pty.onData((id, data) => {
      if (id === ptyId) {
        terminal.write(data)
      }
    })

    // Data flow: terminal -> PTY
    const terminalOnDataDisposable = terminal.onData((data) => {
      window.api.pty.write(ptyId, data)
    })

    // PTY exit handling
    const cleanupOnExit = window.api.pty.onExit((id, code) => {
      if (id === ptyId) {
        terminal.write(
          `\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`,
        )
        ptyIdRef.current = null
      }
    })

    // Resize handling with RAF-based debounce
    let resizeRaf: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf)
      }
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        if (fitAddonRef.current && terminalRef.current) {
          try {
            fitAddonRef.current.fit()
            const newCols = terminalRef.current.cols
            const newRows = terminalRef.current.rows
            if (ptyIdRef.current) {
              window.api.pty.resize(ptyIdRef.current, newCols, newRows)
            }
          } catch {
            // Terminal may be disposed during cleanup
          }
        }
      })
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Store cleanup function
    cleanupRef.current = () => {
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf)
      }
      resizeObserver.disconnect()
      cleanupOnData()
      cleanupOnExit()
      terminalOnDataDisposable.dispose()
      if (ptyIdRef.current) {
        window.api.pty.destroy(ptyIdRef.current)
        ptyIdRef.current = null
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [paneId, config.cwd, config.shell, updatePaneConfig])

  useEffect(() => {
    initTerminal()

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      initedRef.current = false
    }
  }, [initTerminal])

  return <div ref={containerRef} className="w-full h-full" />
}

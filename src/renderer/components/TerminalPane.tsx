import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { useWorkspaceStore } from '../store/workspace-store'
import type { TerminalConfig } from '../types/workspace'

function getTerminalTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    background: isDark ? '#161618' : '#f5f5f7',
    foreground: isDark ? '#e5e5e7' : '#1d1d1f',
    cursor: isDark ? 'rgb(180, 203, 255)' : '#1d1d1f',
    cursorAccent: isDark ? '#161618' : '#f5f5f7',
    selectionBackground: isDark ? 'rgba(180, 203, 255, 0.25)' : 'rgba(0, 0, 0, 0.12)',
    selectionForeground: undefined,
    // t3code-inspired ANSI colors
    black: isDark ? 'rgb(24, 30, 38)' : '#1a1c22',
    red: isDark ? 'rgb(255, 122, 142)' : '#dc2626',
    green: isDark ? 'rgb(134, 231, 149)' : '#16a34a',
    yellow: isDark ? 'rgb(244, 205, 114)' : '#ca8a04',
    blue: isDark ? 'rgb(137, 190, 255)' : '#2563eb',
    magenta: isDark ? 'rgb(208, 176, 255)' : '#9333ea',
    cyan: isDark ? 'rgb(124, 232, 237)' : '#0891b2',
    white: isDark ? 'rgb(210, 218, 230)' : '#e0e4ec',
    brightBlack: isDark ? 'rgb(75, 85, 99)' : '#6b7280',
    brightRed: isDark ? 'rgb(255, 150, 166)' : '#ef4444',
    brightGreen: isDark ? 'rgb(162, 255, 175)' : '#22c55e',
    brightYellow: isDark ? 'rgb(255, 225, 150)' : '#eab308',
    brightBlue: isDark ? 'rgb(165, 210, 255)' : '#3b82f6',
    brightMagenta: isDark ? 'rgb(228, 206, 255)' : '#a855f7',
    brightCyan: isDark ? 'rgb(155, 245, 249)' : '#06b6d4',
    brightWhite: isDark ? '#ffffff' : '#111318',
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
      lineHeight: 1.35,
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

    // Theme sync: watch for dark class changes on <html> and update terminal colors
    const themeObserver = new MutationObserver(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = getTerminalTheme()
        // Force repaint of all visible rows — xterm doesn't repaint on theme change alone
        terminalRef.current.refresh(0, terminalRef.current.rows - 1)
      }
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Store cleanup function
    cleanupRef.current = () => {
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf)
      }
      resizeObserver.disconnect()
      themeObserver.disconnect()
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

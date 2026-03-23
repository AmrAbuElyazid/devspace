import { useEffect, useRef, useCallback } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { toast } from '../hooks/useToast'
import { THEME_CHANGE_EVENT } from '../hooks/useTheme'
import type { TerminalConfig } from '../types/workspace'

function getTerminalTheme(): ITheme {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    background: isDark ? '#09090b' : '#fafaf9',
    foreground: isDark ? '#e5e5e7' : '#1d1d1f',
    cursor: isDark ? '#facc15' : '#ca8a04',
    cursorAccent: isDark ? '#09090b' : '#fafaf9',
    selectionBackground: isDark ? 'rgba(250, 204, 21, 0.15)' : 'rgba(202, 138, 4, 0.15)',
    selectionForeground: undefined,
    // Keep ANSI colors the same (they work well with both themes)
    black: isDark ? '#18181b' : '#1a1c22',
    red: isDark ? '#ff7a8e' : '#dc2626',
    green: isDark ? '#86e795' : '#16a34a',
    yellow: isDark ? '#f4cd72' : '#ca8a04',
    blue: isDark ? '#89beff' : '#2563eb',
    magenta: isDark ? '#d0b0ff' : '#9333ea',
    cyan: isDark ? '#7ce8ed' : '#0891b2',
    white: isDark ? '#d2dae6' : '#e0e4ec',
    brightBlack: isDark ? '#4b5563' : '#6b7280',
    brightRed: isDark ? '#ff96a6' : '#ef4444',
    brightGreen: isDark ? '#a2ffaf' : '#22c55e',
    brightYellow: isDark ? '#ffe196' : '#eab308',
    brightBlue: isDark ? '#a5d2ff' : '#3b82f6',
    brightMagenta: isDark ? '#e4ceff' : '#a855f7',
    brightCyan: isDark ? '#9bf5f9' : '#06b6d4',
    brightWhite: isDark ? '#ffffff' : '#111318',
  }
}

interface TerminalPaneProps {
  paneId: string
  config: TerminalConfig
}

export default function TerminalPane({ paneId, config }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const initedRef = useRef(false)

  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)

  const fontSize = useSettingsStore((s) => s.fontSize)
  const scrollback = useSettingsStore((s) => s.terminalScrollback)
  const cursorStyle = useSettingsStore((s) => s.terminalCursorStyle)
  const defaultShell = useSettingsStore((s) => s.defaultShell)

  const initTerminal = useCallback(async () => {
    if (initedRef.current || !containerRef.current) return
    initedRef.current = true

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: cursorStyle,
      fontSize: fontSize,
      lineHeight: 1.3,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      scrollback: scrollback,
      theme: getTerminalTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.open(containerRef.current)
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
        shell: config.shell || defaultShell || undefined,
      })
    } catch (err) {
      terminal.write(
        `\r\n\x1b[31m[Failed to create terminal: ${err instanceof Error ? err.message : String(err)}]\x1b[0m\r\n`,
      )
      toast('Failed to create terminal', 'error')
      return
    }

    ptyIdRef.current = ptyId
    updatePaneConfig(paneId, { ptyId })

    // Data flow: PTY -> terminal
    const cleanupOnData = window.api.pty.onData((id, data) => {
      if (id === ptyId) terminal.write(data)
    })

    // Data flow: terminal -> PTY
    const terminalOnDataDisposable = terminal.onData((data) => {
      window.api.pty.write(ptyId, data)
    })

    // PTY exit handling
    const cleanupOnExit = window.api.pty.onExit((id, code) => {
      if (id === ptyId) {
        terminal.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
        ptyIdRef.current = null
      }
    })

    // Resize handling with RAF debounce
    let resizeRaf: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        if (fitAddonRef.current && terminalRef.current) {
          try {
            fitAddonRef.current.fit()
            const c = terminalRef.current.cols
            const r = terminalRef.current.rows
            if (ptyIdRef.current) window.api.pty.resize(ptyIdRef.current, c, r)
          } catch {
            // may be disposed
          }
        }
      })
    })
    if (containerRef.current) resizeObserver.observe(containerRef.current)

    // Theme sync: listen for explicit theme change events from useTheme hook.
    // The hook dispatches this event AFTER the .dark class has been toggled,
    // inside a requestAnimationFrame, so the DOM state is guaranteed correct.
    const handleThemeChange = (): void => {
      const t = terminalRef.current
      if (!t) return
      t.options.theme = getTerminalTheme()
      t.refresh(0, t.rows - 1)
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    // Cleanup
    cleanupRef.current = () => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      resizeObserver.disconnect()
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
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
  }, [paneId, config.cwd, config.shell, updatePaneConfig, fontSize, scrollback, cursorStyle, defaultShell])

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

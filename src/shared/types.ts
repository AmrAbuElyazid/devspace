export interface PtyCreateOptions {
  cols: number
  rows: number
  cwd?: string
  shell?: string
}

export interface DevspaceBridge {
  platform: string
  pty: {
    create: (options: PtyCreateOptions) => Promise<string>
    write: (ptyId: string, data: string) => void
    resize: (ptyId: string, cols: number, rows: number) => void
    destroy: (ptyId: string) => void
    onData: (callback: (ptyId: string, data: string) => void) => () => void
    onExit: (callback: (ptyId: string, exitCode: number) => void) => () => void
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
  }
  dialog: {
    openFile: (defaultPath?: string) => Promise<{ path: string; content: string } | null>
    openFolder: () => Promise<string | null>
  }
  fs: {
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
  }
  shell: {
    openExternal: (url: string) => void
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
    getNativeTheme: () => Promise<'light' | 'dark'>
    onNativeThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void
  }
}

declare global {
  interface Window {
    api: DevspaceBridge
  }
}

export type PaneType = 'terminal' | 'browser' | 'editor' | 'empty'

export interface TerminalConfig {
  cwd?: string
  shell?: string
  ptyId?: string
}

export interface BrowserConfig {
  url: string
}

export interface EditorConfig {
  filePath?: string
  language?: string
  content?: string
  scopedFolder?: string
}

export interface EmptyConfig {}

export interface WorkspaceFolder {
  id: string
  name: string
  collapsed: boolean
}

export type PaneConfig = TerminalConfig | BrowserConfig | EditorConfig | EmptyConfig

export interface Pane {
  id: string
  type: PaneType
  title: string
  config: PaneConfig
}

export type SplitDirection = 'horizontal' | 'vertical'

export type SplitNode =
  | { type: 'leaf'; paneId: string }
  | { type: 'branch'; direction: SplitDirection; children: SplitNode[]; sizes: number[] }

export interface Tab {
  id: string
  name: string
  root: SplitNode
  focusedPaneId: string | null
}

export interface Workspace {
  id: string
  name: string
  tabs: Tab[]
  activeTabId: string
  folderId: string | null
}

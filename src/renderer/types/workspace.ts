export type PaneType = 'terminal' | 'browser' | 'editor' | 'empty'

export interface TerminalConfig {
  cwd?: string
}

export interface BrowserConfig {
  url: string
  zoom?: number
}

export interface EditorConfig {
  folderPath?: string
}

export interface EmptyConfig {}

export type PaneConfig = TerminalConfig | BrowserConfig | EditorConfig | EmptyConfig

export interface Pane {
  id: string
  type: PaneType
  title: string
  config: PaneConfig
}

export type SplitDirection = 'horizontal' | 'vertical'

export type SplitNode =
  | { type: 'leaf'; groupId: string }
  | { type: 'branch'; direction: SplitDirection; children: SplitNode[]; sizes: number[] }

export interface PaneGroupTab {
  id: string
  paneId: string
}

export interface PaneGroup {
  id: string
  tabs: PaneGroupTab[]
  activeTabId: string
}

export type SidebarNode =
  | { type: 'workspace'; workspaceId: string }
  | { type: 'folder'; id: string; name: string; collapsed: boolean; children: SidebarNode[] }

export interface Workspace {
  id: string
  name: string
  root: SplitNode
  focusedGroupId: string | null
  pinned: boolean
  lastActiveAt: number
}

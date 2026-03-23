import { useState, useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { FolderOpen, Save, FileCode } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
import { useSettingsStore } from '../store/settings-store'
import { THEME_CHANGE_EVENT } from '../hooks/useTheme'
import { toast } from '../hooks/useToast'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import type { EditorConfig } from '../types/workspace'
import type * as monaco from 'monaco-editor'

interface EditorPaneProps {
  paneId: string
  config: EditorConfig
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    xml: 'xml',
    svg: 'xml',
    toml: 'toml',
    ini: 'ini',
    dockerfile: 'dockerfile',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    java: 'java',
    kt: 'kotlin',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    lua: 'lua',
    r: 'r',
  }
  return map[ext || ''] || 'plaintext'
}

export default function EditorPane({ paneId, config }: EditorPaneProps): JSX.Element {
  const [content, setContent] = useState(config.content || '')
  const [savedContent, setSavedContent] = useState(config.content || '')
  const [filePath, setFilePath] = useState(config.filePath || '')
  const [language, setLanguage] = useState(config.language || 'plaintext')
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const [scopedFolder, setScopedFolder] = useState(config.scopedFolder || '')
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  )

  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle)

  const editorFontSize = useSettingsStore((s) => s.fontSize)
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap)
  const editorMinimap = useSettingsStore((s) => s.editorMinimap)
  const editorTabSize = useSettingsStore((s) => s.editorTabSize)

  const isDirty = content !== savedContent

  useEffect(() => {
    const handleThemeChange = (e: Event): void => {
      const detail = (e as CustomEvent).detail
      setIsDark(detail?.theme === 'dark')
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
  }, [])

  // Use ref to always have the latest save function available to Monaco's command
  const handleSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const handleSave = useCallback(async () => {
    if (!filePath) return
    try {
      await window.api.fs.writeFile(filePath, content)
      setSavedContent(content)
      toast('File saved', 'success')
    } catch (err) {
      console.error('Failed to save file:', err)
      toast('Failed to save file', 'error')
    }
  }, [filePath, content])

  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  const handleOpenFolder = useCallback(async () => {
    const result = await window.api.dialog.openFolder()
    if (!result) return
    setScopedFolder(result)
    updatePaneConfig(paneId, { scopedFolder: result })
  }, [paneId, updatePaneConfig])

  const handleOpenFile = useCallback(async () => {
    const result = await window.api.dialog.openFile(scopedFolder || undefined)
    if (!result) return

    const detectedLang = detectLanguage(result.path)
    const fileName = result.path.split('/').pop() || result.path.split('\\').pop() || result.path

    setContent(result.content)
    setSavedContent(result.content)
    setFilePath(result.path)
    setLanguage(detectedLang)

    updatePaneConfig(paneId, {
      filePath: result.path,
      content: result.content,
      language: detectedLang,
    })
    updatePaneTitle(paneId, fileName)
  }, [paneId, scopedFolder, updatePaneConfig, updatePaneTitle])

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      editorRef.current = editor

      // Register Cmd+S / Ctrl+S (use ref to avoid stale closure)
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        handleSaveRef.current()
      })

      editor.focus()
    },
    [],
  )

  const handleChange = useCallback((value: string | undefined) => {
    setContent(value || '')
  }, [])

  // Empty state: no file open and no content
  if (!filePath && !content) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <FileCode size={48} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Open a file to start editing
        </p>
        <div className="flex gap-2">
          <Button onClick={handleOpenFile}>
            <FolderOpen size={14} />
            Open File
          </Button>
          <Button variant="outline" onClick={handleOpenFolder}>
            <FolderOpen size={14} />
            Open Folder
          </Button>
        </div>
      </div>
    )
  }

  const displayPath = filePath
    ? filePath.length > 60
      ? '...' + filePath.slice(-57)
      : filePath
    : 'Untitled'

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          height: 32,
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: file path + dirty indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          {scopedFolder && (
            <span
              className="text-xs shrink-0"
              style={{
                color: 'var(--foreground-faint)',
                fontFamily: "'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
                fontSize: 10,
              }}
              title={scopedFolder}
            >
              {scopedFolder.split('/').pop()}/
            </span>
          )}
          <span
            className="text-xs truncate"
            style={{
              color: 'var(--muted-foreground)',
              fontFamily: "'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
              fontSize: 11,
            }}
            title={filePath || 'Untitled'}
          >
            {displayPath}
          </span>
          {isDirty && (
            <span
              className="shrink-0"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                display: 'inline-block',
              }}
              title="Unsaved changes"
            />
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Tooltip content="Open File" shortcut="⌘O">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFile}
            >
              <FolderOpen size={12} />
              <span>Open</span>
            </Button>
          </Tooltip>
          {isDirty && filePath && (
            <Tooltip content="Save" shortcut="⌘S">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
              >
                <Save size={12} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme={isDark ? 'vs-dark' : 'vs'}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: editorMinimap },
            fontSize: editorFontSize,
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
            wordWrap: editorWordWrap ? 'on' : 'off',
            tabSize: editorTabSize,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            padding: { top: 8 },
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}

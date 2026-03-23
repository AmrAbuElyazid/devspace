import React, { useState, useRef, useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { FolderOpen, Save, FileCode } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace-store'
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

export default function EditorPane({ paneId, config }: EditorPaneProps): React.JSX.Element {
  const [content, setContent] = useState(config.content || '')
  const [savedContent, setSavedContent] = useState(config.content || '')
  const [filePath, setFilePath] = useState(config.filePath || '')
  const [language, setLanguage] = useState(config.language || 'plaintext')
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig)
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle)

  const isDirty = content !== savedContent
  const isDark = document.documentElement.classList.contains('dark')

  const handleSave = useCallback(async () => {
    if (!filePath) return
    try {
      await window.api.fs.writeFile(filePath, content)
      setSavedContent(content)
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }, [filePath, content])

  const handleOpenFile = useCallback(async () => {
    const result = await window.api.dialog.openFile()
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
  }, [paneId, updatePaneConfig, updatePaneTitle])

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      editorRef.current = editor

      // Register Cmd+S / Ctrl+S
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        handleSave()
      })

      editor.focus()
    },
    [handleSave],
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
        <button
          onClick={handleOpenFile}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            cursor: 'pointer',
          }}
        >
          <FolderOpen size={14} />
          Open File
        </button>
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
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--accent)]"
            style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }}
            title="Open File"
          >
            <FolderOpen size={12} />
            <span>Open</span>
          </button>
          {isDirty && filePath && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--accent)]"
              style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }}
              title="Save (Cmd+S)"
            >
              <Save size={12} />
            </button>
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
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
            wordWrap: 'on',
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

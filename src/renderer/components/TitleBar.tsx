import React from 'react'

export default function TitleBar(): React.JSX.Element {
  const isMac = window.api?.platform === 'darwin'

  return (
    <div
      className="drag-region flex items-center shrink-0 w-full select-none"
      style={{
        height: 'var(--titlebar-height)',
        backgroundColor: 'var(--sidebar-bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {isMac && <div className="shrink-0" style={{ width: 78 }} />}
      <span
        className="text-xs font-medium tracking-wide"
        style={{ color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}
      >
        DevSpace
      </span>
    </div>
  )
}

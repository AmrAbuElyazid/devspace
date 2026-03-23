import React from 'react'

export default function TitleBar(): React.JSX.Element {
  const isMac = window.api?.platform === 'darwin'

  return (
    <div
      className="drag-region flex items-center shrink-0 w-full border-b"
      style={{
        height: 'var(--titlebar-height)',
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Padding for macOS traffic light buttons */}
      {isMac && <div className="shrink-0" style={{ width: 90 }} />}

      {/* App title */}
      <div
        className="text-sm font-medium select-none"
        style={{ color: 'var(--muted-foreground)', paddingLeft: isMac ? 0 : 16 }}
      >
        DevSpace
      </div>
    </div>
  )
}

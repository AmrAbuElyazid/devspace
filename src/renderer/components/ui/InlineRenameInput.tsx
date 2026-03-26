import { memo, useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'

interface InlineRenameInputProps {
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
}

export const InlineRenameInput = memo(function InlineRenameInput({
  initialValue,
  onCommit,
  onCancel,
  className = '',
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Blur native views (Ghostty terminal) so the web input can receive focus,
    // then wait a frame for the DOM to settle before focusing.
    void window.api?.terminal?.blur?.()
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    })
  }, [])

  const handleCommit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== initialValue) {
      onCommit(trimmed)
    } else {
      onCancel()
    }
  }, [value, initialValue, onCommit, onCancel])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCommit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [handleCommit, onCancel],
  )

  return (
    <input
      ref={inputRef}
      className={`flex-1 bg-transparent outline-none ${className}`}
      style={{ color: 'var(--foreground)' }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleCommit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
})

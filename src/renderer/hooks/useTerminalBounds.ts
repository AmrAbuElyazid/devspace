import { useEffect, type RefObject } from 'react'
import type { TerminalBounds } from '../../shared/types'

interface UseTerminalBoundsOptions {
  surfaceId: string
  enabled: boolean
  ref: RefObject<HTMLElement | null>
}

function toContentBounds(rect: DOMRect): TerminalBounds {
  const x = Math.round(rect.left)
  const y = Math.round(rect.top)
  const width = Math.max(0, Math.round(rect.width))
  const height = Math.max(0, Math.round(rect.height))

  return { x, y, width, height }
}

function boundsEqual(a: TerminalBounds | null, b: TerminalBounds): boolean {
  return a !== null
    && a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height
}

export function useTerminalBounds({ surfaceId, enabled, ref }: UseTerminalBoundsOptions): void {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) {
      return
    }

    let frameId: number | null = null
    let lastBounds: TerminalBounds | null = null

    const syncBounds = (): void => {
      frameId = null
      const nextElement = ref.current
      if (!enabled || !nextElement) {
        return
      }

      const nextBounds = toContentBounds(nextElement.getBoundingClientRect())
      if (boundsEqual(lastBounds, nextBounds)) {
        return
      }

      lastBounds = nextBounds
      void window.api.terminal.setBounds(surfaceId, nextBounds)
    }

    const scheduleSync = (): void => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(syncBounds)
    }

    const resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(element)

    scheduleSync()
    window.addEventListener('resize', scheduleSync)
    window.addEventListener('scroll', scheduleSync, true)

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('scroll', scheduleSync, true)
    }
  }, [enabled, surfaceId, ref])
}

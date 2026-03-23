import { useEffect, type RefObject } from 'react'
import type { BrowserBounds } from '../../shared/browser'

interface UseBrowserBoundsOptions {
  paneId: string
  enabled: boolean
  ref: RefObject<HTMLElement | null>
}

function toContentBounds(rect: DOMRect): BrowserBounds {
  const x = Math.round(rect.left)
  const y = Math.round(rect.top)
  const width = Math.max(0, Math.round(rect.width))
  const height = Math.max(0, Math.round(rect.height))

  return { x, y, width, height }
}

function boundsEqual(a: BrowserBounds | null, b: BrowserBounds): boolean {
  return a !== null
    && a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height
}

export function useBrowserBounds({ paneId, enabled, ref }: UseBrowserBoundsOptions): void {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) {
      return
    }

    let frameId: number | null = null
    let lastBounds: BrowserBounds | null = null

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
      void window.api.browser.setBounds(paneId, nextBounds)
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
  }, [enabled, paneId, ref])
}

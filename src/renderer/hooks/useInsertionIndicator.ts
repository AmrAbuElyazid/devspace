import { useEffect, useState, type RefObject } from 'react'

/**
 * Tracks whether the pointer is in the "before" or "after" zone of an element
 * during a drag-over. Used to render insertion line indicators.
 *
 * @param isOver      — from useSortable: whether the pointer is over this item
 * @param isDragging  — from useSortable: whether THIS item is the one being dragged
 * @param elementRef  — ref to the DOM element for bounding rect computation
 * @param axis        — 'vertical' for sidebar (top/bottom), 'horizontal' for tabs (left/right)
 * @param edgeThreshold — proportion of each edge that triggers before/after.
 *                        0.5 = full split (default for workspace/tab items).
 *                        0.25 = only edges trigger, center returns null (for folders).
 */
export function useInsertionIndicator(
  isOver: boolean,
  isDragging: boolean,
  elementRef: RefObject<HTMLElement | null>,
  axis: 'vertical' | 'horizontal' = 'vertical',
  edgeThreshold: number = 0.5,
): 'before' | 'after' | null {
  const [position, setPosition] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    if (!isOver || isDragging || !elementRef.current) {
      setPosition(null)
      return
    }

    const el = elementRef.current

    function handlePointerMove(e: PointerEvent): void {
      const rect = el.getBoundingClientRect()
      const rel = axis === 'vertical'
        ? (e.clientY - rect.top) / rect.height
        : (e.clientX - rect.left) / rect.width

      if (edgeThreshold >= 0.5) {
        // Full split: top/left half = before, bottom/right half = after
        setPosition(rel < 0.5 ? 'before' : 'after')
      } else {
        // Edge zones only: center returns null (used for folder "drop into" zone)
        if (rel < edgeThreshold) setPosition('before')
        else if (rel > 1 - edgeThreshold) setPosition('after')
        else setPosition(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [isOver, isDragging, axis, edgeThreshold])

  return position
}

import type { BrowserBounds } from '../../shared/browser'

type BoundsLike = {
  x: number
  y: number
}

type ViewWithBounds = {
  webContents?: {
    id?: number
  }
  getBounds?: () => BoundsLike
}

type ParentViewLike = {
  children?: ViewWithBounds[]
}

export function findHostViewBounds(parentView: ParentViewLike, webContentsId: number): BoundsLike | null {
  const child = parentView.children?.find((view) => view.webContents?.id === webContentsId)
  if (!child || typeof child.getBounds !== 'function') {
    return null
  }

  const { x, y } = child.getBounds()
  return { x, y }
}

export function translateRendererBoundsToContentBounds(
  bounds: BrowserBounds,
  hostViewBounds: BoundsLike | null,
): BrowserBounds {
  if (!hostViewBounds) {
    return bounds
  }

  return {
    x: bounds.x + Math.round(hostViewBounds.x),
    y: bounds.y + Math.round(hostViewBounds.y),
    width: bounds.width,
    height: bounds.height,
  }
}

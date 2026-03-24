import type { BrowserWindow } from 'electron'
import { loadNativeAddon, type GhosttyBridge, type TerminalBounds } from './native'

type TerminalCallback = {
  onTitleChanged?: (surfaceId: string, title: string) => void
  onSurfaceClosed?: (surfaceId: string) => void
}

export class TerminalManager {
  private bridge: GhosttyBridge | null = null
  private callbacks: TerminalCallback = {}
  private activeSurfaces = new Set<string>()

  init(mainWindow: BrowserWindow): void {
    this.bridge = loadNativeAddon()
    const handle = mainWindow.getNativeWindowHandle()
    this.bridge.init(handle)

    this.bridge.setCallback('title-changed', (surfaceId: unknown, title: unknown) => {
      if (typeof surfaceId === 'string' && typeof title === 'string') {
        this.callbacks.onTitleChanged?.(surfaceId, title)
      }
    })

    this.bridge.setCallback('surface-closed', (surfaceId: unknown) => {
      if (typeof surfaceId === 'string') {
        this.activeSurfaces.delete(surfaceId)
        this.callbacks.onSurfaceClosed?.(surfaceId)
      }
    })
  }

  onTitleChanged(callback: (surfaceId: string, title: string) => void): void {
    this.callbacks.onTitleChanged = callback
  }

  onSurfaceClosed(callback: (surfaceId: string) => void): void {
    this.callbacks.onSurfaceClosed = callback
  }

  createSurface(surfaceId: string): void {
    if (!this.bridge) return
    this.bridge.createSurface(surfaceId)
    this.activeSurfaces.add(surfaceId)
  }

  destroySurface(surfaceId: string): void {
    if (!this.bridge) return
    this.activeSurfaces.delete(surfaceId)
    this.bridge.destroySurface(surfaceId)
  }

  showSurface(surfaceId: string): void {
    if (!this.bridge) return
    this.bridge.showSurface(surfaceId)
  }

  hideSurface(surfaceId: string): void {
    if (!this.bridge) return
    this.bridge.hideSurface(surfaceId)
  }

  focusSurface(surfaceId: string): void {
    if (!this.bridge) return
    this.bridge.focusSurface(surfaceId)
  }

  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.bridge) return
    this.bridge.setVisibleSurfaces(surfaceIds)
  }

  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.bridge) return
    this.bridge.resizeSurface(surfaceId, bounds.x, bounds.y, bounds.width, bounds.height)
  }

  blurSurfaces(): void {
    if (!this.bridge) return
    this.bridge.blurSurfaces()
  }

  destroyAll(): void {
    if (!this.bridge) return
    for (const surfaceId of this.activeSurfaces) {
      this.bridge.destroySurface(surfaceId)
    }
    this.activeSurfaces.clear()
  }
}

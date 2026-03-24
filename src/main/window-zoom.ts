type WebContentsZoomLike = {
  getZoomFactor?: () => number
  setZoomFactor?: (factor: number) => void | Promise<void>
  setVisualZoomLevelLimits?: (minimumLevel: number, maximumLevel: number) => void | Promise<void>
  on?: (event: 'did-finish-load', listener: () => void) => unknown
}

export function resetWindowZoom(webContents: WebContentsZoomLike): void {
  const setZoomFactor = webContents.setZoomFactor
  if (typeof setZoomFactor === 'function') {
    void setZoomFactor.call(webContents, 1)
  }

  const setVisualZoomLevelLimits = webContents.setVisualZoomLevelLimits
  if (typeof setVisualZoomLevelLimits === 'function') {
    void setVisualZoomLevelLimits.call(webContents, 1, 1)
  }
}

export function installWindowZoomReset(webContents: WebContentsZoomLike): void {
  const on = webContents.on
  if (typeof on !== 'function') {
    return
  }

  on.call(webContents, 'did-finish-load', () => {
    resetWindowZoom(webContents)
  })
}

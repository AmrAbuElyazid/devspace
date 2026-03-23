const createdPaneIds = new Set<string>()

export function hasCreatedBrowserPane(paneId: string): boolean {
  return createdPaneIds.has(paneId)
}

export function markBrowserPaneCreated(paneId: string): void {
  createdPaneIds.add(paneId)
}

export function markBrowserPaneDestroyed(paneId: string): void {
  createdPaneIds.delete(paneId)
}

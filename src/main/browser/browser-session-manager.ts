import type { Session } from 'electron'

export const BROWSER_PARTITION = 'persist:devspace-global-browser'

export interface BrowserSessionModule {
  fromPartition(partition: string): Session
}

function getElectronSession(): BrowserSessionModule {
  return require('electron').session as typeof import('electron').session
}

export class BrowserSessionManager {
  constructor(private readonly sessionModule: BrowserSessionModule = getElectronSession()) {}

  getSession(): Session {
    return this.sessionModule.fromPartition(BROWSER_PARTITION)
  }

  installHandlers(): void {
    const ses = this.getSession()
    ses.setPermissionCheckHandler(() => false)
  }
}

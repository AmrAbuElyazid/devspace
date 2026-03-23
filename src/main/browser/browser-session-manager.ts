import type { Session } from 'electron'

export const BROWSER_PARTITION = 'persist:devspace-global-browser'

function getElectronSession(): typeof import('electron').session {
  return require('electron').session as typeof import('electron').session
}

export class BrowserSessionManager {
  getSession(): Session {
    return getElectronSession().fromPartition(BROWSER_PARTITION)
  }

  installHandlers(): void {
    const ses = this.getSession()
    ses.setPermissionCheckHandler(() => false)
  }
}

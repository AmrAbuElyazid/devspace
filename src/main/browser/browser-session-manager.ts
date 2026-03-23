import type { Session } from 'electron'

export const BROWSER_PARTITION = 'persist:devspace-global-browser'

export interface BrowserSessionModule {
  fromPartition(partition: string): Session
}

export interface BrowserSessionManagerDeps {
  resolvePaneIdForWebContents: (webContentsId: number) => string | undefined
  reportCertificateError: (paneId: string, url: string) => void
  appModule?: {
    on: (
      event: 'certificate-error',
      listener: (
        event: { preventDefault: () => void },
        webContents: { id: number } | null,
        url: string,
        error: string,
        certificate: unknown,
        callback: (isTrusted: boolean) => void,
      ) => void,
    ) => unknown
  }
  log?: (message: string, meta?: Record<string, unknown>) => void
}

function getElectronSession(): BrowserSessionModule {
  return require('electron').session as typeof import('electron').session
}

function getElectronApp(): NonNullable<BrowserSessionManagerDeps['appModule']> {
  return require('electron').app as typeof import('electron').app
}

export class BrowserSessionManager {
  constructor(private readonly sessionModule: BrowserSessionModule = getElectronSession()) {}

  getSession(): Session {
    return this.sessionModule.fromPartition(BROWSER_PARTITION)
  }

  installHandlers(deps?: BrowserSessionManagerDeps): void {
    const ses = this.getSession()
    const log = deps?.log ?? ((message: string, meta?: Record<string, unknown>) => {
      console.warn(message, meta)
    })

    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      if (!webContents) {
        log('[browser] missing webContents for permission request; denying by default', {
          permission,
          requestingOrigin,
          details,
        })
        return false
      }

      const paneId = deps?.resolvePaneIdForWebContents(webContents.id)
      if (!paneId) {
        log('[browser] unresolved browser permission request; denying by default', {
          webContentsId: webContents.id,
          permission,
          requestingOrigin,
          details,
        })
        return false
      }

      return false
    })

    const appModule = deps?.appModule ?? getElectronApp()
    appModule.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault()

      if (!webContents) {
        log('[browser] missing webContents for certificate error; denying by default', {
          url,
          error,
          certificate,
        })
        callback(false)
        return
      }

      const paneId = deps?.resolvePaneIdForWebContents(webContents.id)
      if (!paneId) {
        log('[browser] unresolved browser certificate error; denying by default', {
          webContentsId: webContents.id,
          url,
          error,
          certificate,
        })
        callback(false)
        return
      }

      deps?.reportCertificateError(paneId, url)
      callback(false)
    })
  }
}

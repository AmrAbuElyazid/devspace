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

type CertificateVerifyRequest = {
  hostname?: string
  errorCode?: number
  verificationResult?: string
  webContents?: { id: number } | null
}

function getElectronSession(): BrowserSessionModule {
  return require('electron').session as typeof import('electron').session
}

function getElectronApp(): NonNullable<BrowserSessionManagerDeps['appModule']> {
  return require('electron').app as typeof import('electron').app
}

export class BrowserSessionManager {
  private certificateErrorListenerRegistered = false

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

    if (typeof ses.setCertificateVerifyProc === 'function') {
      ses.setCertificateVerifyProc((request: CertificateVerifyRequest, callback: (verificationResult: number) => void) => {
        if (request.errorCode === 0 || request.verificationResult === 'net::OK') {
          callback(-3)
          return
        }

        const url = request.hostname ? `https://${request.hostname}/` : 'about:blank'
        const webContentsId = request.webContents?.id
        if (typeof webContentsId !== 'number') {
          log('[browser] missing webContents for certificate verification; denying by default', {
            hostname: request.hostname,
            errorCode: request.errorCode,
            verificationResult: request.verificationResult,
          })
          callback(-2)
          return
        }

        const paneId = deps?.resolvePaneIdForWebContents(webContentsId)
        if (!paneId) {
          log('[browser] unresolved browser certificate verification; denying by default', {
            webContentsId,
            hostname: request.hostname,
            errorCode: request.errorCode,
            verificationResult: request.verificationResult,
          })
          callback(-2)
          return
        }

        deps?.reportCertificateError(paneId, url)
        callback(-2)
      })
    }

    if (!this.certificateErrorListenerRegistered) {
      this.certificateErrorListenerRegistered = true
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
}

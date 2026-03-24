import type { Session } from 'electron'
import { randomUUID } from 'node:crypto'
import type { BrowserPermissionDecision, BrowserPermissionRequest, BrowserPermissionType } from '../../shared/browser'

export const BROWSER_PARTITION = 'persist:devspace-global-browser'

export interface BrowserSessionModule {
  fromPartition(partition: string): Session
}

export interface BrowserSessionManagerDeps {
  resolvePaneIdForWebContents: (webContentsId: number) => string | undefined
  reportCertificateError: (paneId: string, url: string) => void
  requestBrowserPermission?: (
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ) => void
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

type PermissionRequestDetails = {
  mediaType?: string
  requestingUrl?: string
}

type SessionPermissionGrantKey = `${BrowserPermissionType}|${string}`

function mapPermissionType(permission: string, details: PermissionRequestDetails): BrowserPermissionType | null {
  if (permission === 'geolocation' || permission === 'notifications') {
    return permission
  }

  if (permission === 'media') {
    if (details.mediaType === 'video') {
      return 'camera'
    }
    if (details.mediaType === 'audio') {
      return 'microphone'
    }
  }

  return null
}

function toRequestOrigin(rawUrl: string | undefined, fallbackUrl: string | undefined): string | null {
  const candidate = rawUrl || fallbackUrl
  if (!candidate) {
    return null
  }

  try {
    return new URL(candidate).origin
  } catch {
    return null
  }
}

function decisionAllows(decision: BrowserPermissionDecision): boolean {
  return decision === 'allow-once' || decision === 'allow-for-session'
}

function getElectronSession(): BrowserSessionModule {
  return require('electron').session as typeof import('electron').session
}

function getElectronApp(): NonNullable<BrowserSessionManagerDeps['appModule']> {
  return require('electron').app as typeof import('electron').app
}

export class BrowserSessionManager {
  private certificateErrorListenerRegistered = false
  private currentDeps: BrowserSessionManagerDeps | undefined
  private currentLog: (message: string, meta?: Record<string, unknown>) => void = (message, meta) => {
    console.warn(message, meta)
  }
  private readonly sessionPermissionGrants = new Set<SessionPermissionGrantKey>()

  constructor(private readonly sessionModule: BrowserSessionModule = getElectronSession()) {}

  getSession(): Session {
    return this.sessionModule.fromPartition(BROWSER_PARTITION)
  }

  /**
   * Convert session cookies (no expiry) into persistent cookies so auth
   * tokens survive app restarts.  Session cookies are ephemeral by design
   * in Chromium — without this, VS Code web logs the user out on every
   * quit because its auth cookies have no Expires header.
   */
  persistSessionCookies(): void {
    const ses = this.getSession()
    const cookies = ses.cookies as {
      on?: (event: string, listener: (...args: unknown[]) => void) => void
      get?: (filter: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
      set?: (details: Record<string, unknown>) => Promise<void>
    }

    if (typeof cookies.on !== 'function' || typeof cookies.set !== 'function') return

    // 30 days from now, in seconds since epoch
    const thirtyDays = () => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

    cookies.on('changed', (_event: unknown, cookie: Record<string, unknown>, _cause: unknown, removed: unknown) => {
      if (removed) return
      // Only process session cookies (those without an expiration)
      if (cookie.session !== true) return

      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain as string}${cookie.path as string || '/'}`
      void (cookies.set as (d: Record<string, unknown>) => Promise<void>)({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: thirtyDays(),
      }).catch(() => {
        // Silently ignore — some cookies can't be re-set (e.g. __Host- prefixed)
      })
    })
  }

  installHandlers(deps?: BrowserSessionManagerDeps): void {
    const ses = this.getSession()
    const log = deps?.log ?? ((message: string, meta?: Record<string, unknown>) => {
      console.warn(message, meta)
    })
    this.currentDeps = deps
    this.currentLog = log

    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const permissionType = mapPermissionType(permission, (details ?? {}) as PermissionRequestDetails)
      const origin = toRequestOrigin(
        (details as PermissionRequestDetails | undefined)?.requestingUrl,
        requestingOrigin,
      )

      if (permissionType && origin && this.sessionPermissionGrants.has(this.toSessionPermissionGrantKey(permissionType, origin))) {
        return true
      }

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

      if (!permissionType || !origin) {
        return false
      }

      return this.sessionPermissionGrants.has(this.toSessionPermissionGrantKey(permissionType, origin))
    })

    if (typeof ses.setPermissionRequestHandler === 'function') {
      ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (!webContents) {
          log('[browser] missing webContents for permission request prompt; denying by default', {
            permission,
            details,
          })
          callback(false)
          return
        }

        const paneId = deps?.resolvePaneIdForWebContents(webContents.id)
        if (!paneId) {
          log('[browser] unresolved browser permission request prompt; denying by default', {
            webContentsId: webContents.id,
            permission,
            details,
          })
          callback(false)
          return
        }

        const permissionType = mapPermissionType(permission, (details ?? {}) as PermissionRequestDetails)
        const origin = toRequestOrigin(
          (details as PermissionRequestDetails | undefined)?.requestingUrl,
          typeof (webContents as { getURL?: () => string }).getURL === 'function'
            ? (webContents as { getURL: () => string }).getURL()
            : undefined,
        )

        if (!permissionType || !origin || !deps?.requestBrowserPermission) {
          callback(false)
          return
        }

        deps.requestBrowserPermission({
          paneId,
          origin,
          permissionType,
          requestToken: randomUUID(),
        }, (decision) => {
          if (decision === 'allow-for-session') {
            this.sessionPermissionGrants.add(this.toSessionPermissionGrantKey(permissionType, origin))
          }
          callback(decisionAllows(decision))
        })
      })
    }

    if (typeof ses.setCertificateVerifyProc === 'function') {
      ses.setCertificateVerifyProc((request: CertificateVerifyRequest, callback: (verificationResult: number) => void) => {
        if (request.errorCode === 0 || request.verificationResult === 'net::OK') {
          callback(-3)
          return
        }

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

        if (!deps?.resolvePaneIdForWebContents(webContentsId)) {
          log('[browser] unresolved browser certificate verification; denying by default', {
            webContentsId,
            hostname: request.hostname,
            errorCode: request.errorCode,
            verificationResult: request.verificationResult,
          })
          callback(-2)
          return
        }

        callback(-2)
      })
    }

    if (!this.certificateErrorListenerRegistered) {
      this.certificateErrorListenerRegistered = true
      const appModule = deps?.appModule ?? getElectronApp()
      appModule.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault()
        const currentDeps = this.currentDeps
        const currentLog = this.currentLog

        if (!webContents) {
          currentLog('[browser] missing webContents for certificate error; denying by default', {
            url,
            error,
            certificate,
          })
          callback(false)
          return
        }

        if (!currentDeps?.resolvePaneIdForWebContents(webContents.id)) {
          currentLog('[browser] unresolved browser certificate error; denying by default', {
            webContentsId: webContents.id,
            url,
            error,
            certificate,
          })
          callback(false)
          return
        }

        callback(false)
      })
    }
  }

  private toSessionPermissionGrantKey(permissionType: BrowserPermissionType, origin: string): SessionPermissionGrantKey {
    return `${permissionType}|${origin}`
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import type { Session } from 'electron'
import {
  BROWSER_PARTITION,
  BrowserSessionManager,
} from '../browser-session-manager'

type PermissionCheckHandler = Parameters<Session['setPermissionCheckHandler']>[0]
type CertificateVerifyProc = Parameters<Session['setCertificateVerifyProc']>[0]
type CertificateErrorListener = (
  event: { preventDefault: () => void },
  webContents: { id: number },
  url: string,
  error: string,
  certificate: unknown,
  callback: (isTrusted: boolean) => void,
) => void

test('uses a dedicated persistent browser partition', () => {
  assert.equal(BROWSER_PARTITION, 'persist:devspace-global-browser')
})

test('getSession uses fromPartition with the shared browser partition', () => {
  const fakeSession = {
    setPermissionCheckHandler: () => {},
    setCertificateVerifyProc: () => {},
  }
  let partition: string | undefined

  const manager = new BrowserSessionManager({
    fromPartition: (nextPartition) => {
      partition = nextPartition
      return fakeSession as never
    },
  })

  const session = manager.getSession()

  assert.equal(partition, BROWSER_PARTITION)
  assert.equal(session, fakeSession)
})

test('installHandlers registers a permission check handler on the session', () => {
  let registeredHandler: PermissionCheckHandler | undefined
  let registeredVerifyProc: CertificateVerifyProc | undefined

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
        registeredHandler = handler
      },
      setCertificateVerifyProc: (handler: CertificateVerifyProc) => {
        registeredVerifyProc = handler
      },
    }) as never,
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule: { on: () => undefined },
    log: () => {},
  })

  assert.equal(typeof registeredHandler, 'function')
  assert.equal(typeof registeredVerifyProc, 'function')
  assert.equal(registeredHandler?.({ id: 1 } as never, 'notifications', 'https://example.com', {} as never), false)
})

test('certificate verification fails closed and reports pane failures', () => {
  let registeredVerifyProc: CertificateVerifyProc | undefined
  const reported: Array<{ paneId: string; url: string }> = []
  const logs: string[] = []

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: () => {},
      setCertificateVerifyProc: (handler: CertificateVerifyProc) => {
        registeredVerifyProc = handler
      },
    }) as never,
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => webContentsId === 9 ? 'pane-9' : undefined,
    reportCertificateError: (paneId, url) => {
      reported.push({ paneId, url })
    },
    appModule: { on: () => undefined },
    log: (message) => {
      logs.push(message)
    },
  })

  let verificationResult: number | undefined
  registeredVerifyProc?.(
    {
      hostname: 'expired.badssl.com',
      verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID',
      errorCode: -202,
      validatedCertificate: {},
      certificate: {},
      isIssuedByKnownRoot: false,
      verificationTime: 0,
      webContents: { id: 9 },
    } as never,
    (result) => {
      verificationResult = result
    },
  )

  assert.equal(verificationResult, -2)
  assert.deepEqual(reported, [{ paneId: 'pane-9', url: 'https://expired.badssl.com/' }])
  assert.equal(logs.length, 0)
})

test('permission checks fail closed and log when pane resolution fails', () => {
  let registeredHandler: PermissionCheckHandler | undefined
  const logs: string[] = []

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
        registeredHandler = handler
      },
      setCertificateVerifyProc: () => {},
    }) as never,
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule: { on: () => undefined },
    log: (message) => {
      logs.push(message)
    },
  })

  const allowed = registeredHandler?.({ id: 42 } as never, 'notifications', 'https://example.com', {} as never)

  assert.equal(allowed, false)
  assert.match(logs[0] ?? '', /unresolved browser permission request/i)
})

test('certificate errors are blocked and routed to the owning pane', () => {
  let certificateErrorListener: CertificateErrorListener | undefined
  const reported: Array<{ paneId: string; url: string }> = []
  let prevented = false
  let trusted: boolean | undefined

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: () => {},
      setCertificateVerifyProc: () => {},
    }) as never,
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => webContentsId === 7 ? 'pane-7' : undefined,
    reportCertificateError: (paneId, url) => {
      reported.push({ paneId, url })
    },
    appModule: {
      on: (event, listener) => {
        if (event === 'certificate-error') {
          certificateErrorListener = listener as CertificateErrorListener
        }
        return undefined
      },
    },
    log: () => {},
  })

  certificateErrorListener?.(
    { preventDefault: () => { prevented = true } },
    { id: 7 },
    'https://expired.badssl.com/',
    'ERR_CERT_AUTHORITY_INVALID',
    {},
    (isTrusted) => { trusted = isTrusted },
  )

  assert.equal(prevented, true)
  assert.equal(trusted, false)
  assert.deepEqual(reported, [{ paneId: 'pane-7', url: 'https://expired.badssl.com/' }])
})

test('installHandlers does not accumulate duplicate global certificate listeners', () => {
  const listeners: CertificateErrorListener[] = []

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: () => {},
      setCertificateVerifyProc: () => {},
    }) as never,
  })

  const appModule = {
    on: (_event: 'certificate-error', listener: CertificateErrorListener) => {
      listeners.push(listener)
    },
  }

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule,
    log: () => {},
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule,
    log: () => {},
  })

  assert.equal(listeners.length, 1)
})

test('global certificate listener uses the latest routing callbacks', () => {
  let certificateErrorListener: CertificateErrorListener | undefined
  const reports: Array<{ paneId: string; url: string }> = []

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: () => {},
      setCertificateVerifyProc: () => {},
    }) as never,
  })

  const appModule = {
    on: (_event: 'certificate-error', listener: CertificateErrorListener) => {
      certificateErrorListener = listener
    },
  }

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => webContentsId === 1 ? 'stale-pane' : undefined,
    reportCertificateError: (paneId, url) => {
      reports.push({ paneId, url })
    },
    appModule,
    log: () => {},
  })

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => webContentsId === 2 ? 'fresh-pane' : undefined,
    reportCertificateError: (paneId, url) => {
      reports.push({ paneId, url })
    },
    appModule,
    log: () => {},
  })

  let trusted: boolean | undefined
  certificateErrorListener?.(
    { preventDefault: () => {} },
    { id: 2 },
    'https://expired.badssl.com/',
    'ERR_CERT_AUTHORITY_INVALID',
    {},
    (isTrusted) => { trusted = isTrusted },
  )

  assert.equal(trusted, false)
  assert.deepEqual(reports, [{ paneId: 'fresh-pane', url: 'https://expired.badssl.com/' }])
})

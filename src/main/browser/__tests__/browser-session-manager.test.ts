import assert from 'node:assert/strict'
import test from 'node:test'
import type { Session } from 'electron'
import {
  BROWSER_PARTITION,
  BrowserSessionManager,
} from '../browser-session-manager'

type PermissionCheckHandler = Parameters<Session['setPermissionCheckHandler']>[0]
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

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
        registeredHandler = handler
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
  assert.equal(registeredHandler?.({ id: 1 } as never, 'notifications', 'https://example.com', {} as never), false)
})

test('permission checks fail closed and log when pane resolution fails', () => {
  let registeredHandler: PermissionCheckHandler | undefined
  const logs: string[] = []

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
        registeredHandler = handler
      },
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

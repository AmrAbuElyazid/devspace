import assert from 'node:assert/strict'
import test from 'node:test'
import type { Session } from 'electron'
import {
  BROWSER_PARTITION,
  BrowserSessionManager,
} from '../browser-session-manager'

type PermissionCheckHandler = Parameters<Session['setPermissionCheckHandler']>[0]

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
  let registeredHandler: (() => boolean) | undefined

  const manager = new BrowserSessionManager({
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
        registeredHandler = handler as () => boolean
      },
    }) as never,
  })

  manager.installHandlers()

  assert.equal(typeof registeredHandler, 'function')
  assert.equal(registeredHandler?.(), false)
})

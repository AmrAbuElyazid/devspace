import assert from 'node:assert/strict'
import test from 'node:test'
import { BROWSER_PARTITION } from '../browser-session-manager'

test('uses a dedicated persistent browser partition', () => {
  assert.equal(BROWSER_PARTITION, 'persist:devspace-global-browser')
})

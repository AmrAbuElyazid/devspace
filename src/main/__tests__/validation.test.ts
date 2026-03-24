import assert from 'node:assert/strict'
import test from 'node:test'
import { getSafeExternalUrl } from '../validation'

test('getSafeExternalUrl allows the Safari Full Disk Access settings deep link', () => {
  assert.equal(
    getSafeExternalUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'),
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  )
})

test('getSafeExternalUrl continues rejecting other non-http schemes', () => {
  assert.equal(getSafeExternalUrl('file:///etc/passwd'), null)
  assert.equal(getSafeExternalUrl('javascript:alert(1)'), null)
  assert.equal(getSafeExternalUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'), null)
})

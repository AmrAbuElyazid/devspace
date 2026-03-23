import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBrowserInput } from '../browser-url'

test('adds https for domain-like input', () => {
  assert.equal(normalizeBrowserInput('example.com'), 'https://example.com')
})

test('maps plain text to Google search', () => {
  assert.equal(
    normalizeBrowserInput('hello world'),
    'https://www.google.com/search?q=hello%20world',
  )
})

test('keeps explicit schemes unchanged', () => {
  assert.equal(normalizeBrowserInput('https://example.com/a'), 'https://example.com/a')
})

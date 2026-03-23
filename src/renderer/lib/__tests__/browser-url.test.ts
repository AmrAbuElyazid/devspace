import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBrowserInput } from '../browser-url'

test('adds https for domain-like input', () => {
  assert.equal(normalizeBrowserInput('example.com'), 'https://example.com')
})

test('adds http for localhost host:port input', () => {
  assert.equal(normalizeBrowserInput('localhost:3000'), 'http://localhost:3000')
})

test('maps plain text to Google search', () => {
  assert.equal(
    normalizeBrowserInput('hello world'),
    'https://www.google.com/search?q=hello%20world',
  )
})

test('maps dotted plain text with spaces to Google search', () => {
  assert.equal(
    normalizeBrowserInput('what is node.js'),
    'https://www.google.com/search?q=what%20is%20node.js',
  )
})

test('trims whitespace-heavy input before normalization', () => {
  assert.equal(normalizeBrowserInput('   example.com   '), 'https://example.com')
})

test('keeps explicit schemes unchanged', () => {
  assert.equal(normalizeBrowserInput('https://example.com/a'), 'https://example.com/a')
  assert.equal(normalizeBrowserInput('about:blank'), 'about:blank')
  assert.equal(normalizeBrowserInput('mailto:test@example.com'), 'mailto:test@example.com')
})

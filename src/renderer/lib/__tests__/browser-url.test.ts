import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchUrl, getAddressBarSubmitValue, normalizeBrowserInput } from '../browser-url'

test('adds https for domain-like input', () => {
  assert.equal(normalizeBrowserInput('example.com'), 'https://example.com')
})

test('adds http for localhost host:port input', () => {
  assert.equal(normalizeBrowserInput('localhost:3000'), 'http://localhost:3000')
})

test('adds http for bare localhost input', () => {
  assert.equal(normalizeBrowserInput('localhost'), 'http://localhost')
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

test('buildSearchUrl always creates a web search for url-like text', () => {
  assert.equal(
    buildSearchUrl('example.com/docs'),
    'https://www.google.com/search?q=example.com%2Fdocs',
  )
  assert.equal(
    buildSearchUrl('https://devspace.example'),
    'https://www.google.com/search?q=https%3A%2F%2Fdevspace.example',
  )
})

test('getAddressBarSubmitValue prefers the live input value over stale state', () => {
  assert.equal(getAddressBarSubmitValue('typed.dev', 'https://current.example'), 'typed.dev')
  assert.equal(getAddressBarSubmitValue(undefined, 'https://current.example'), 'https://current.example')
})

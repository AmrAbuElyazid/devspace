import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import BrowserImportPanel from './BrowserImportPanel'

test('BrowserImportPanel renders browser import actions', () => {
  const html = renderToStaticMarkup(<BrowserImportPanel />)

  expect(html).toContain('Browser')
  expect(html).toContain('Chrome')
  expect(html).toContain('Safari')
  expect(html).toContain('Cookies + Session')
  expect(html).toContain('History')
  expect(html).toContain('Everything')
})

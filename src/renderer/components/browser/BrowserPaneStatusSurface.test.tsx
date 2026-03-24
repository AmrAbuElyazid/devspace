import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import BrowserPaneStatusSurface from './BrowserPaneStatusSurface'

test('renders navigation failure recovery actions', () => {
  const html = renderToStaticMarkup(
    <BrowserPaneStatusSurface
      failure={{
        kind: 'navigation',
        detail: 'NAME_NOT_RESOLVED',
        url: 'https://bad.example',
      }}
      onPrimaryAction={() => {}}
      onDismiss={() => {}}
    />,
  )

  expect(html).toContain('Couldn&#x27;t open this page')
  expect(html).toContain('https://bad.example')
  expect(html).toContain('NAME_NOT_RESOLVED')
  expect(html).toContain('Try again')
  expect(html).not.toContain('Dismiss')
})

test('renders crash recovery actions', () => {
  const html = renderToStaticMarkup(
    <BrowserPaneStatusSurface
      failure={{
        kind: 'crash',
        detail: 'crashed',
        url: 'https://example.com',
      }}
      onPrimaryAction={() => {}}
      onDismiss={() => {}}
    />,
  )

  expect(html).toContain('Browser pane crashed')
  expect(html).toContain('Reload pane')
  expect(html).not.toContain('Dismiss')
})

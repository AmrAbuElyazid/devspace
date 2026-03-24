import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import BrowserPermissionPrompt from './BrowserPermissionPrompt'

test('renders the permission request origin and decision actions', () => {
  const html = renderToStaticMarkup(
    <BrowserPermissionPrompt
      request={{
        paneId: 'pane-1',
        origin: 'https://camera.example',
        permissionType: 'camera',
        requestToken: 'token-1',
      }}
      onDecision={() => {}}
      onDismiss={() => {}}
    />,
  )

  expect(html).toContain('https://camera.example')
  expect(html).toContain('Camera')
  expect(html).toContain('Allow once')
  expect(html).toContain('Allow for session')
  expect(html).toContain('Deny')
})

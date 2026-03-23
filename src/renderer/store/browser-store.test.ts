import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserStore } from './browser-store'

test('updates runtime state by paneId', () => {
  const store = createBrowserStore()
  store.getState().upsertRuntimeState({ paneId: 'pane-1', url: 'https://a.com', title: 'A', faviconUrl: null, isLoading: false, canGoBack: false, canGoForward: false, isSecure: true, securityLabel: 'Secure', currentZoom: 1, find: null })
  assert.equal(store.getState().runtimeByPaneId['pane-1']?.title, 'A')
})

test('clears runtime state by paneId', () => {
  const store = createBrowserStore()
  store.getState().upsertRuntimeState({ paneId: 'pane-1', url: 'https://a.com', title: 'A', faviconUrl: null, isLoading: false, canGoBack: false, canGoForward: false, isSecure: true, securityLabel: 'Secure', currentZoom: 1, find: null })

  store.getState().clearRuntimeState('pane-1')

  assert.equal(store.getState().runtimeByPaneId['pane-1'], undefined)
})

test('tracks and clears pending permission requests', () => {
  const store = createBrowserStore()
  const request = {
    paneId: 'pane-1',
    origin: 'https://a.com',
    permissionType: 'camera' as const,
    requestToken: 'token-1',
  }

  store.getState().setPendingPermissionRequest(request)
  assert.deepEqual(store.getState().pendingPermissionRequest, request)

  store.getState().clearPendingPermissionRequest()
  assert.equal(store.getState().pendingPermissionRequest, null)
})

test('clears session pane creation bookkeeping when a browser pane is destroyed', () => {
  const store = createBrowserStore()

  store.getState().markPaneCreated('pane-1')
  assert.equal(store.getState().createdPaneIds['pane-1'], true)

  store.getState().markPaneDestroyed('pane-1')
  assert.equal(store.getState().createdPaneIds['pane-1'], undefined)
})

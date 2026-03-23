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

test('handles runtime state changes and only persists changed urls', () => {
  const store = createBrowserStore()
  const persisted: Array<{ paneId: string; url: string }> = []
  const runtimeState = { paneId: 'pane-1', url: 'https://a.com', title: 'A', faviconUrl: null, isLoading: false, canGoBack: false, canGoForward: false, isSecure: true, securityLabel: 'Secure', currentZoom: 1, find: null } as const

  store.getState().handleRuntimeStateChange(runtimeState, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url })
    },
    persistCommittedNavigation: true,
  })
  store.getState().handleRuntimeStateChange(runtimeState, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url })
    },
    persistCommittedNavigation: true,
  })

  assert.deepEqual(persisted, [{ paneId: 'pane-1', url: 'https://a.com' }])
  assert.equal(store.getState().runtimeByPaneId['pane-1']?.title, 'A')
})

test('does not persist uncommitted navigation targets', () => {
  const store = createBrowserStore()
  const persisted: Array<{ paneId: string; url: string }> = []

  store.getState().handleRuntimeStateChange({
    paneId: 'pane-1',
    url: 'https://committed.example',
    title: 'Committed',
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: 'Secure',
    currentZoom: 1,
    find: null,
  }, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url })
    },
    persistCommittedNavigation: true,
  })

  store.getState().handleRuntimeStateChange({
    paneId: 'pane-1',
    url: 'https://typed-but-uncommitted.example',
    title: 'Committed',
    faviconUrl: null,
    isLoading: true,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: 'Secure',
    currentZoom: 1,
    find: null,
  }, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url })
    },
    persistCommittedNavigation: false,
  })

  assert.deepEqual(persisted, [{ paneId: 'pane-1', url: 'https://committed.example' }])
  assert.equal(store.getState().runtimeByPaneId['pane-1']?.url, 'https://typed-but-uncommitted.example')
})

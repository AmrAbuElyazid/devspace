import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanupPaneResources } from '../lib/pane-cleanup'
import { useWorkspaceStore } from './workspace-store'

test('cleanupPaneResources destroys browser panes and clears runtime state', () => {
  const destroyedPaneIds: string[] = []
  const clearedPaneIds: string[] = []

  cleanupPaneResources(
    {
      'pane-1': {
        id: 'pane-1',
        type: 'browser',
        title: 'Browser',
        config: { url: 'https://example.com' },
      },
    },
    'pane-1',
    {
      destroyPty: () => {
        throw new Error('unexpected PTY cleanup')
      },
      destroyBrowser: (paneId) => {
        destroyedPaneIds.push(paneId)
      },
      clearBrowserRuntime: (paneId) => {
        clearedPaneIds.push(paneId)
      },
    },
  )

  assert.deepEqual(destroyedPaneIds, ['pane-1'])
  assert.deepEqual(clearedPaneIds, ['pane-1'])
})

test('updateBrowserPaneZoom persists zoom on browser pane config only', () => {
  const initialState = useWorkspaceStore.getState()
  const originalPanes = initialState.panes

  useWorkspaceStore.setState({
    panes: {
      'pane-1': {
        id: 'pane-1',
        type: 'browser',
        title: 'Browser',
        config: { url: 'https://example.com', zoom: 1 },
      },
      'pane-2': {
        id: 'pane-2',
        type: 'terminal',
        title: 'Terminal',
        config: {},
      },
    },
  })

  useWorkspaceStore.getState().updateBrowserPaneZoom('pane-1', 1.25)
  useWorkspaceStore.getState().updateBrowserPaneZoom('pane-2', 2)

  assert.deepEqual(useWorkspaceStore.getState().panes['pane-1']?.config, {
    url: 'https://example.com',
    zoom: 1.25,
  })
  assert.deepEqual(useWorkspaceStore.getState().panes['pane-2']?.config, {})

  useWorkspaceStore.setState({ panes: originalPanes })
})

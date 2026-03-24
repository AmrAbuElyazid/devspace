import type { DevspaceBridge } from '../shared/types'
import { getElectronBridge } from './electron-bridge'

const { contextBridge, ipcRenderer } = getElectronBridge()

const bridge: DevspaceBridge = {
  platform: process.platform,

  app: {
    onAction: (callback) => {
      const channels = [
        'app:new-tab', 'app:close-tab', 'app:new-workspace',
        'app:toggle-sidebar', 'app:toggle-settings',
        'app:split-right', 'app:split-down', 'app:switch-tab',
        'app:browser-focus-url', 'app:browser-reload',
        'app:browser-back', 'app:browser-forward', 'app:browser-find',
        'app:browser-zoom-in', 'app:browser-zoom-out', 'app:browser-zoom-reset',
        'app:browser-devtools',
      ]
      const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
        // The channel name is not passed to the listener, so we use per-channel listeners
      }
      const disposers: (() => void)[] = []
      for (const channel of channels) {
        const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
          callback(channel, ...args)
        }
        ipcRenderer.on(channel, handler)
        disposers.push(() => ipcRenderer.removeListener(channel, handler))
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
  },

  terminal: {
    create: (surfaceId, options) => ipcRenderer.invoke('terminal:create', surfaceId, options),
    destroy: (surfaceId) => ipcRenderer.invoke('terminal:destroy', surfaceId),
    show: (surfaceId) => ipcRenderer.invoke('terminal:show', surfaceId),
    hide: (surfaceId) => ipcRenderer.invoke('terminal:hide', surfaceId),
    focus: (surfaceId) => ipcRenderer.invoke('terminal:focus', surfaceId),
    setBounds: (surfaceId, bounds) => ipcRenderer.invoke('terminal:setBounds', surfaceId, bounds),
    setVisibleSurfaces: (surfaceIds) => ipcRenderer.invoke('terminal:setVisibleSurfaces', surfaceIds),
    blur: () => ipcRenderer.invoke('terminal:blur'),
    onTitleChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, surfaceId: string, title: string): void => {
        callback(surfaceId, title)
      }
      ipcRenderer.on('terminal:titleChanged', listener)
      return () => {
        ipcRenderer.removeListener('terminal:titleChanged', listener)
      }
    },
    onClosed: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, surfaceId: string): void => {
        callback(surfaceId)
      }
      ipcRenderer.on('terminal:closed', listener)
      return () => {
        ipcRenderer.removeListener('terminal:closed', listener)
      }
    },
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximizeChange', listener)
      return () => {
        ipcRenderer.removeListener('window:maximizeChange', listener)
      }
    }
  },

  dialog: {
    openFile: (defaultPath) => ipcRenderer.invoke('dialog:openFile', defaultPath),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder')
  },

  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content)
  },

  shell: {
    openExternal: (url) => ipcRenderer.send('shell:openExternal', url)
  },

  contextMenu: {
    show: (items, position) => ipcRenderer.invoke('contextMenu:show', items, position),
  },

  theme: {
    set: (theme) => ipcRenderer.send('theme:set', theme),
    getNativeTheme: () => ipcRenderer.invoke('theme:getNativeTheme'),
    onNativeThemeChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark'): void => {
        callback(theme)
      }
      ipcRenderer.on('theme:nativeThemeChange', listener)
      return () => {
        ipcRenderer.removeListener('theme:nativeThemeChange', listener)
      }
    }
  },

  browser: {
    create: (paneId, url) => ipcRenderer.invoke('browser:create', paneId, url),
    destroy: (paneId) => ipcRenderer.invoke('browser:destroy', paneId),
    show: (paneId) => ipcRenderer.invoke('browser:show', paneId),
    hide: (paneId) => ipcRenderer.invoke('browser:hide', paneId),
    getRuntimeState: (paneId) => ipcRenderer.invoke('browser:getRuntimeState', paneId),
    navigate: (paneId, url) => ipcRenderer.invoke('browser:navigate', paneId, url),
    back: (paneId) => ipcRenderer.invoke('browser:back', paneId),
    forward: (paneId) => ipcRenderer.invoke('browser:forward', paneId),
    reload: (paneId) => ipcRenderer.invoke('browser:reload', paneId),
    stop: (paneId) => ipcRenderer.invoke('browser:stop', paneId),
    setBounds: (paneId, bounds) => ipcRenderer.invoke('browser:setBounds', paneId, bounds),
    setFocus: (paneId) => ipcRenderer.invoke('browser:setFocus', paneId),
    setZoom: (paneId, zoom) => ipcRenderer.invoke('browser:setZoom', paneId, zoom),
    resetZoom: (paneId) => ipcRenderer.invoke('browser:resetZoom', paneId),
    findInPage: (paneId, query, options) => ipcRenderer.invoke('browser:findInPage', paneId, query, options),
    stopFindInPage: (paneId, action) => ipcRenderer.invoke('browser:stopFindInPage', paneId, action),
    toggleDevTools: (paneId) => ipcRenderer.invoke('browser:toggleDevTools', paneId),
    showContextMenu: (paneId, position) => ipcRenderer.invoke('browser:showContextMenu', paneId, position),
    resolvePermission: (requestToken, decision) => ipcRenderer.invoke('browser:resolvePermission', requestToken, decision),
    listChromeProfiles: () => ipcRenderer.invoke('browser:listChromeProfiles'),
    importChrome: (profilePath, mode) => ipcRenderer.invoke('browser:importChrome', profilePath, mode),
    importSafari: (mode) => ipcRenderer.invoke('browser:importSafari', mode),
    detectSafariAccess: (mode) => ipcRenderer.invoke('browser:detectSafariAccess', mode),
    onStateChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]): void => {
        callback(state)
      }
      ipcRenderer.on('browser:stateChanged', listener)
      return () => {
        ipcRenderer.removeListener('browser:stateChanged', listener)
      }
    },
    onPermissionRequest: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => {
        callback(request)
      }
      ipcRenderer.on('browser:permissionRequested', listener)
      return () => {
        ipcRenderer.removeListener('browser:permissionRequested', listener)
      }
    },
    onContextMenuRequest: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => {
        callback(request)
      }
      ipcRenderer.on('browser:contextMenuRequested', listener)
      return () => {
        ipcRenderer.removeListener('browser:contextMenuRequested', listener)
      }
    },
    onOpenInNewTabRequest: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => {
        callback(request)
      }
      ipcRenderer.on('browser:openInNewTabRequested', listener)
      return () => {
        ipcRenderer.removeListener('browser:openInNewTabRequested', listener)
      }
    },
  }
}

contextBridge.exposeInMainWorld('api', bridge)

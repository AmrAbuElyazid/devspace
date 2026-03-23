import { contextBridge, ipcRenderer } from 'electron'
import type { DevspaceBridge } from '../shared/types'

const bridge: DevspaceBridge = {
  platform: process.platform,

  pty: {
    create: (options) => ipcRenderer.invoke('pty:create', options),
    write: (ptyId, data) => ipcRenderer.send('pty:write', ptyId, data),
    resize: (ptyId, cols, rows) => ipcRenderer.send('pty:resize', ptyId, cols, rows),
    destroy: (ptyId) => ipcRenderer.send('pty:destroy', ptyId),
    onData: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, ptyId: string, data: string): void => {
        callback(ptyId, data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => {
        ipcRenderer.removeListener('pty:data', listener)
      }
    },
    onExit: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        ptyId: string,
        exitCode: number
      ): void => {
        callback(ptyId, exitCode)
      }
      ipcRenderer.on('pty:exit', listener)
      return () => {
        ipcRenderer.removeListener('pty:exit', listener)
      }
    }
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
    loadURL: (paneId, url) => ipcRenderer.invoke('browser:loadURL', paneId, url),
    goBack: (paneId) => ipcRenderer.invoke('browser:goBack', paneId),
    goForward: (paneId) => ipcRenderer.invoke('browser:goForward', paneId),
    reload: (paneId) => ipcRenderer.invoke('browser:reload', paneId),
    stop: (paneId) => ipcRenderer.invoke('browser:stop', paneId),
    setBounds: (paneId, bounds) => ipcRenderer.invoke('browser:setBounds', paneId, bounds),
    setFocus: (paneId) => ipcRenderer.invoke('browser:setFocus', paneId),
    setZoom: (paneId, zoom) => ipcRenderer.invoke('browser:setZoom', paneId, zoom),
    findInPage: (paneId, query) => ipcRenderer.invoke('browser:findInPage', paneId, query),
    stopFindInPage: (paneId, action) => ipcRenderer.invoke('browser:stopFindInPage', paneId, action),
    onStateChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]): void => {
        callback(state)
      }
      ipcRenderer.on('browser:stateChange', listener)
      return () => {
        ipcRenderer.removeListener('browser:stateChange', listener)
      }
    },
    onPermissionRequest: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => {
        callback(request)
      }
      ipcRenderer.on('browser:permissionRequest', listener)
      return () => {
        ipcRenderer.removeListener('browser:permissionRequest', listener)
      }
    },
  }
}

contextBridge.exposeInMainWorld('api', bridge)

import type { DevspaceBridge } from "../shared/types";
import { DEFAULT_SHORTCUTS } from "../shared/shortcuts";
import { getElectronBridge } from "./electron-bridge";

const { contextBridge, ipcRenderer } = getElectronBridge();

/** Collect unique IPC channels from the shortcut registry. */
const APP_ACTION_CHANNELS = [...new Set(DEFAULT_SHORTCUTS.map((d) => d.ipcChannel))];

const bridge: DevspaceBridge = {
  platform: process.platform,

  app: {
    onAction: (callback) => {
      const disposers: (() => void)[] = [];
      for (const channel of APP_ACTION_CHANNELS) {
        const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
          callback(channel, ...args);
        };
        ipcRenderer.on(channel, handler);
        disposers.push(() => ipcRenderer.removeListener(channel, handler));
      }
      return () => {
        for (const dispose of disposers) dispose();
      };
    },
  },

  terminal: {
    create: (surfaceId, options) => ipcRenderer.invoke("terminal:create", surfaceId, options),
    destroy: (surfaceId) => ipcRenderer.invoke("terminal:destroy", surfaceId),
    show: (surfaceId) => ipcRenderer.invoke("terminal:show", surfaceId),
    hide: (surfaceId) => ipcRenderer.invoke("terminal:hide", surfaceId),
    focus: (surfaceId) => ipcRenderer.send("terminal:focus", surfaceId),
    setBounds: (surfaceId, bounds) => ipcRenderer.send("terminal:setBounds", surfaceId, bounds),
    setVisibleSurfaces: (surfaceIds) => ipcRenderer.send("terminal:setVisibleSurfaces", surfaceIds),
    sendBindingAction: (surfaceId, action) =>
      ipcRenderer.invoke("terminal:sendBindingAction", surfaceId, action),
    blur: () => ipcRenderer.send("terminal:blur"),
    onTitleChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaceId: string,
        title: string,
      ): void => {
        callback(surfaceId, title);
      };
      ipcRenderer.on("terminal:titleChanged", listener);
      return () => {
        ipcRenderer.removeListener("terminal:titleChanged", listener);
      };
    },
    onClosed: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, surfaceId: string): void => {
        callback(surfaceId);
      };
      ipcRenderer.on("terminal:closed", listener);
      return () => {
        ipcRenderer.removeListener("terminal:closed", listener);
      };
    },
    onFocused: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, surfaceId: string): void => {
        callback(surfaceId);
      };
      ipcRenderer.on("terminal:focused", listener);
      return () => {
        ipcRenderer.removeListener("terminal:focused", listener);
      };
    },
    onPwdChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaceId: string,
        pwd: string,
      ): void => {
        callback(surfaceId, pwd);
      };
      ipcRenderer.on("terminal:pwdChanged", listener);
      return () => {
        ipcRenderer.removeListener("terminal:pwdChanged", listener);
      };
    },
    onSearchStart: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaceId: string,
        needle: string,
      ): void => {
        callback(surfaceId, needle);
      };
      ipcRenderer.on("terminal:searchStart", listener);
      return () => {
        ipcRenderer.removeListener("terminal:searchStart", listener);
      };
    },
    onSearchEnd: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, surfaceId: string): void => {
        callback(surfaceId);
      };
      ipcRenderer.on("terminal:searchEnd", listener);
      return () => {
        ipcRenderer.removeListener("terminal:searchEnd", listener);
      };
    },
    onSearchTotal: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaceId: string,
        total: number,
      ): void => {
        callback(surfaceId, total);
      };
      ipcRenderer.on("terminal:searchTotal", listener);
      return () => {
        ipcRenderer.removeListener("terminal:searchTotal", listener);
      };
    },
    onSearchSelected: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaceId: string,
        selected: number,
      ): void => {
        callback(surfaceId, selected);
      };
      ipcRenderer.on("terminal:searchSelected", listener);
      return () => {
        ipcRenderer.removeListener("terminal:searchSelected", listener);
      };
    },
  },

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    focusContent: () => ipcRenderer.send("window:focusContent"),
    setSidebarOpen: (open) => ipcRenderer.send("window:setSidebarOpen", open),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
    onMaximizeChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized);
      };
      ipcRenderer.on("window:maximizeChange", listener);
      return () => {
        ipcRenderer.removeListener("window:maximizeChange", listener);
      };
    },
    onFullScreenChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, fullScreen: boolean): void => {
        callback(fullScreen);
      };
      ipcRenderer.on("window:fullScreenChange", listener);
      return () => {
        ipcRenderer.removeListener("window:fullScreenChange", listener);
      };
    },
    onFocus: (callback) => {
      const listener = (): void => {
        callback();
      };
      ipcRenderer.on("window:focus", listener);
      return () => {
        ipcRenderer.removeListener("window:focus", listener);
      };
    },
    onNativeModifierChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        modifier: "command" | "control" | null,
      ): void => {
        callback(modifier);
      };
      ipcRenderer.on("window:nativeModifierChanged", listener);
      return () => {
        ipcRenderer.removeListener("window:nativeModifierChanged", listener);
      };
    },
    onOpenEditor: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, folderPath: string): void => {
        callback(folderPath);
      };
      ipcRenderer.on("open-editor", listener);
      return () => {
        ipcRenderer.removeListener("open-editor", listener);
      };
    },
  },

  dialog: {
    openFile: (defaultPath) => ipcRenderer.invoke("dialog:openFile", defaultPath),
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },

  notes: {
    read: (noteId) => ipcRenderer.invoke("notes:read", noteId),
    save: (noteId, content) => ipcRenderer.invoke("notes:save", noteId, content),
    list: () => ipcRenderer.invoke("notes:list"),
  },

  shell: {
    openExternal: (url) => ipcRenderer.send("shell:openExternal", url),
  },

  contextMenu: {
    show: (items, position) => ipcRenderer.invoke("contextMenu:show", items, position),
  },

  editor: {
    isAvailable: (configuredCli) => ipcRenderer.invoke("editor:isAvailable", configuredCli),
    getCliStatus: (configuredCli) => ipcRenderer.invoke("editor:getCliStatus", configuredCli),
    start: (paneId, folderPath, configuredCli) =>
      ipcRenderer.invoke("editor:start", paneId, folderPath, configuredCli),
    stop: (paneId) => ipcRenderer.invoke("editor:stop", paneId),
    setKeepServerRunning: (keep) => ipcRenderer.send("editor:setKeepServerRunning", keep),
  },

  shortcuts: {
    getAll: () => ipcRenderer.invoke("shortcuts:get-all"),
    set: (action, shortcut) => ipcRenderer.invoke("shortcuts:set", action, shortcut),
    reset: (action) => ipcRenderer.invoke("shortcuts:reset", action),
    resetAll: () => ipcRenderer.invoke("shortcuts:reset-all"),
    onChanged: (callback) => {
      const listener = (): void => {
        callback();
      };
      ipcRenderer.on("shortcuts:changed", listener);
      return () => {
        ipcRenderer.removeListener("shortcuts:changed", listener);
      };
    },
  },

  cli: {
    install: () => ipcRenderer.invoke("cli:install"),
  },

  t3code: {
    isAvailable: () => ipcRenderer.invoke("t3code:isAvailable"),
    start: (paneId) => ipcRenderer.invoke("t3code:start", paneId),
    stop: (paneId) => ipcRenderer.invoke("t3code:stop", paneId),
  },

  browser: {
    create: (paneId, url) => ipcRenderer.invoke("browser:create", paneId, url),
    destroy: (paneId) => ipcRenderer.invoke("browser:destroy", paneId),
    show: (paneId) => ipcRenderer.invoke("browser:show", paneId),
    hide: (paneId) => ipcRenderer.invoke("browser:hide", paneId),
    setVisiblePanes: (paneIds) => ipcRenderer.send("browser:setVisiblePanes", paneIds),
    getRuntimeState: (paneId) => ipcRenderer.invoke("browser:getRuntimeState", paneId),
    navigate: (paneId, url) => ipcRenderer.invoke("browser:navigate", paneId, url),
    back: (paneId) => ipcRenderer.invoke("browser:back", paneId),
    forward: (paneId) => ipcRenderer.invoke("browser:forward", paneId),
    reload: (paneId) => ipcRenderer.invoke("browser:reload", paneId),
    stop: (paneId) => ipcRenderer.invoke("browser:stop", paneId),
    setBounds: (paneId, bounds) => ipcRenderer.send("browser:setBounds", paneId, bounds),
    setFocus: (paneId) => ipcRenderer.send("browser:setFocus", paneId),
    setZoom: (paneId, zoom) => ipcRenderer.invoke("browser:setZoom", paneId, zoom),
    resetZoom: (paneId) => ipcRenderer.invoke("browser:resetZoom", paneId),
    findInPage: (paneId, query, options) =>
      ipcRenderer.invoke("browser:findInPage", paneId, query, options),
    stopFindInPage: (paneId, action) =>
      ipcRenderer.invoke("browser:stopFindInPage", paneId, action),
    toggleDevTools: (paneId) => ipcRenderer.invoke("browser:toggleDevTools", paneId),
    showContextMenu: (paneId, position) =>
      ipcRenderer.invoke("browser:showContextMenu", paneId, position),
    resolvePermission: (requestToken, decision) =>
      ipcRenderer.invoke("browser:resolvePermission", requestToken, decision),
    listProfiles: (browser) => ipcRenderer.invoke("browser:listProfiles", browser),
    importBrowser: (browser, profilePath, mode) =>
      ipcRenderer.invoke("browser:import", browser, profilePath, mode),
    detectAccess: (browser, mode) => ipcRenderer.invoke("browser:detectAccess", browser, mode),
    clearBrowsingData: (target) => ipcRenderer.invoke("browser:clearData", target),
    onStateChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: Parameters<typeof callback>[0],
      ): void => {
        callback(state);
      };
      ipcRenderer.on("browser:stateChanged", listener);
      return () => {
        ipcRenderer.removeListener("browser:stateChanged", listener);
      };
    },
    onFocused: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, paneId: string): void => {
        callback(paneId);
      };
      ipcRenderer.on("browser:focused", listener);
      return () => {
        ipcRenderer.removeListener("browser:focused", listener);
      };
    },
    onPermissionRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: Parameters<typeof callback>[0],
      ): void => {
        callback(request);
      };
      ipcRenderer.on("browser:permissionRequested", listener);
      return () => {
        ipcRenderer.removeListener("browser:permissionRequested", listener);
      };
    },
    onContextMenuRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: Parameters<typeof callback>[0],
      ): void => {
        callback(request);
      };
      ipcRenderer.on("browser:contextMenuRequested", listener);
      return () => {
        ipcRenderer.removeListener("browser:contextMenuRequested", listener);
      };
    },
    onOpenInNewTabRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: Parameters<typeof callback>[0],
      ): void => {
        callback(request);
      };
      ipcRenderer.on("browser:openInNewTabRequested", listener);
      return () => {
        ipcRenderer.removeListener("browser:openInNewTabRequested", listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("api", bridge);

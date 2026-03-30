import { contextBridge, ipcRenderer } from "electron";

export function getElectronBridge() {
  return {
    contextBridge,
    ipcRenderer,
  };
}

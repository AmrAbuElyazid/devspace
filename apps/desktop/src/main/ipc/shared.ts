import { ipcMain } from "electron";

const registeredHandlers = new Set<string>();

export function safeHandle(channel: string, handler: (event: any, ...args: any[]) => any): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.handle(channel, handler);
}

export function safeOn(channel: string, handler: (event: any, ...args: any[]) => void): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.on(channel, handler);
}

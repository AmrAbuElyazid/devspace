import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";

const registeredHandlers = new Set<string>();
const trustedWebContents = new Set<WebContents>();

type IpcHandleHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => TResult;
type IpcOnHandler<TArgs extends unknown[] = unknown[]> = (
  event: IpcMainEvent,
  ...args: TArgs
) => void;

type IpcEvent = IpcMainEvent | IpcMainInvokeEvent;

export function trustIpcWebContents(webContents: WebContents): void {
  trustedWebContents.add(webContents);
}

export function untrustIpcWebContents(webContents: WebContents): void {
  trustedWebContents.delete(webContents);
}

function isTrustedIpcEvent(event: IpcEvent): boolean {
  if (trustedWebContents.size === 0) return true;
  if (!("sender" in event)) return true;
  return trustedWebContents.has(event.sender);
}

function rejectUntrustedIpc(channel: string): never {
  throw new Error(`Rejected IPC call from untrusted sender: ${channel}`);
}

export function safeHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: IpcHandleHandler<TArgs, TResult>,
): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcEvent(event)) return rejectUntrustedIpc(channel);
    return handler(event, ...(args as TArgs));
  });
}

export function safeOn<TArgs extends unknown[]>(
  channel: string,
  handler: IpcOnHandler<TArgs>,
): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedIpcEvent(event)) return;
    handler(event, ...(args as TArgs));
  });
}

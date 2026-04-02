import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";

const registeredHandlers = new Set<string>();

type IpcHandleHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => TResult;
type IpcOnHandler<TArgs extends unknown[] = unknown[]> = (
  event: IpcMainEvent,
  ...args: TArgs
) => void;

export function safeHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: IpcHandleHandler<TArgs, TResult>,
): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.handle(channel, handler);
}

export function safeOn<TArgs extends unknown[]>(
  channel: string,
  handler: IpcOnHandler<TArgs>,
): void {
  if (registeredHandlers.has(channel)) return;
  registeredHandlers.add(channel);
  ipcMain.on(channel, handler);
}

import type { BrowserWindow } from "electron";
import { homedir } from "os";
import type { TerminalManager } from "./terminal-manager";
import type { VscodeServerManager } from "./vscode-server";
import type { T3CodeServerManager } from "./t3code-server";
import type { BrowserPaneController } from "./browser/browser-types";
import type { BrowserImportService } from "./browser/browser-import-service";
import type { BrowserSessionManager } from "./browser/browser-session-manager";
import { registerBrowserIpc } from "./ipc/browser";
import { registerSystemIpc } from "./ipc/system";
import { registerTerminalAndEditorIpc } from "./ipc/terminal-editor";

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  terminalManager: TerminalManager,
  browserPaneManager: BrowserPaneController,
  vscodeServerManager: VscodeServerManager,
  t3codeServerManager: T3CodeServerManager,
  browserImportService?: BrowserImportService,
  browserSessionManager?: BrowserSessionManager,
): void {
  const allowedRoots = [homedir()];

  registerTerminalAndEditorIpc(
    mainWindow,
    terminalManager,
    browserPaneManager,
    vscodeServerManager,
    t3codeServerManager,
    browserSessionManager,
  );
  registerSystemIpc(mainWindow, allowedRoots);
  registerBrowserIpc(mainWindow, browserPaneManager, browserImportService);
}

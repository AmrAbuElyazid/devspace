import type { BrowserWindow } from "electron";
import type { TerminalManager } from "./terminal-manager";
import type { VscodeServerManager } from "./vscode-server";
import type { T3CodeServerManager } from "./t3code-server";
import type { BrowserPaneController } from "./browser/browser-types";
import type { BrowserImportService } from "./browser/browser-import-service";
import type { BrowserSessionManager } from "./browser/browser-session-manager";
import type { AppUpdaterLike } from "./app-updater";
import { registerBrowserIpc } from "./ipc/browser";
import { registerSystemIpc } from "./ipc/system";
import { registerTerminalAndEditorIpc } from "./ipc/terminal-editor";
import { registerWorkspaceStateIpc } from "./ipc/workspace-state";

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  terminalManager: TerminalManager,
  browserPaneManager: BrowserPaneController,
  vscodeServerManager: VscodeServerManager,
  t3codeServerManager: T3CodeServerManager,
  browserImportService?: BrowserImportService,
  editorSessionManager?: BrowserSessionManager,
  browserSessionManager?: BrowserSessionManager,
  appUpdater?: AppUpdaterLike,
): void {
  registerTerminalAndEditorIpc(
    mainWindow,
    terminalManager,
    browserPaneManager,
    vscodeServerManager,
    t3codeServerManager,
    editorSessionManager,
    browserSessionManager,
  );
  registerSystemIpc(mainWindow, appUpdater);
  registerBrowserIpc(mainWindow, browserPaneManager, browserImportService);
  registerWorkspaceStateIpc();
}

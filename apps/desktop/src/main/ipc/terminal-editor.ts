import type { BrowserWindow } from "electron";
import type { BrowserPaneController } from "../browser/browser-types";
import type { BrowserSessionManager } from "../browser/browser-session-manager";
import { safeHandle, safeOn } from "./shared";
import type { T3CodeServerManager } from "../t3code-server";
import type { TerminalManager } from "../terminal-manager";
import type { VscodeServerManager } from "../vscode-server";

export function registerTerminalAndEditorIpc(
  mainWindow: BrowserWindow,
  terminalManager: TerminalManager,
  browserPaneManager: BrowserPaneController,
  vscodeServerManager: VscodeServerManager,
  t3codeServerManager: T3CodeServerManager,
  browserSessionManager?: Pick<
    BrowserSessionManager,
    "registerTrustedLocalOrigin" | "unregisterTrustedLocalOrigin"
  >,
): void {
  safeHandle("terminal:create", (_event, surfaceId: unknown, options: unknown) => {
    if (typeof surfaceId !== "string") return;
    const opts =
      typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
    const cwd = typeof opts["cwd"] === "string" ? opts["cwd"] : undefined;

    let envVars: Record<string, string> | undefined;
    if (typeof opts["envVars"] === "object" && opts["envVars"] !== null) {
      const raw = opts["envVars"] as Record<string, unknown>;
      envVars = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string") envVars[key] = value;
      }
      if (Object.keys(envVars).length === 0) envVars = undefined;
    }

    const createOpts: { cwd?: string; envVars?: Record<string, string> } = {};
    if (cwd) createOpts.cwd = cwd;
    if (envVars) createOpts.envVars = envVars;

    try {
      terminalManager.createSurface(
        surfaceId,
        Object.keys(createOpts).length > 0 ? createOpts : undefined,
      );
      return { ok: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message } as const;
    }
  });

  safeHandle("terminal:destroy", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.destroySurface(surfaceId);
  });

  safeHandle("terminal:show", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.showSurface(surfaceId);
  });

  safeHandle("terminal:hide", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.hideSurface(surfaceId);
  });

  safeOn("terminal:focus", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    terminalManager.focusSurface(surfaceId);
  });

  safeOn("terminal:setVisibleSurfaces", (_event, surfaceIds: unknown) => {
    if (!Array.isArray(surfaceIds)) return;
    const valid = surfaceIds.filter((id): id is string => typeof id === "string");
    terminalManager.setVisibleSurfaces(valid);
  });

  safeOn("terminal:blur", (event) => {
    terminalManager.blurSurfaces();
    mainWindow.webContents.send("window:nativeModifierChanged", null);
    event.sender.focus();
  });

  safeHandle("terminal:sendBindingAction", (_event, surfaceId: unknown, action: unknown) => {
    if (typeof surfaceId !== "string" || typeof action !== "string") return false;
    return terminalManager.sendBindingAction(surfaceId, action);
  });

  safeOn("terminal:setBounds", (_event, surfaceId: unknown, bounds: unknown) => {
    if (typeof surfaceId !== "string" || typeof bounds !== "object" || bounds === null) return;
    const nextBounds = bounds as Partial<{ x: number; y: number; width: number; height: number }>;
    if (
      typeof nextBounds.x !== "number" ||
      typeof nextBounds.y !== "number" ||
      typeof nextBounds.width !== "number" ||
      typeof nextBounds.height !== "number"
    ) {
      return;
    }

    terminalManager.setBounds(surfaceId, {
      x: nextBounds.x,
      y: nextBounds.y,
      width: nextBounds.width,
      height: nextBounds.height,
    });
  });

  const editorPaneSessions = new Map<string, { folder: string | undefined; url: string }>();
  const t3codePaneUrls = new Map<string, string>();

  safeHandle("editor:isAvailable", (_event, configuredCli: unknown) => {
    return vscodeServerManager.isAvailable(
      typeof configuredCli === "string" ? configuredCli : undefined,
    );
  });

  safeHandle("editor:getCliStatus", (_event, configuredCli: unknown) => {
    return vscodeServerManager.getCliStatus(
      typeof configuredCli === "string" ? configuredCli : undefined,
    );
  });

  safeHandle(
    "editor:start",
    async (_event, paneId: unknown, folderPath: unknown, configuredCli: unknown) => {
      if (typeof paneId !== "string") {
        return { error: "Invalid arguments" };
      }

      const folder = typeof folderPath === "string" ? folderPath : undefined;
      const preferredCli = typeof configuredCli === "string" ? configuredCli : undefined;
      try {
        const { url } = await vscodeServerManager.start(folder, preferredCli);
        const existingSession = editorPaneSessions.get(paneId);
        if (existingSession) {
          browserSessionManager?.unregisterTrustedLocalOrigin(existingSession.url);
          vscodeServerManager.release(existingSession.folder);
        }

        editorPaneSessions.set(paneId, { folder, url });
        browserSessionManager?.registerTrustedLocalOrigin(url);
        browserPaneManager.createPane(paneId, url, "editor");
        return { url };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  );

  safeHandle("editor:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    if (editorPaneSessions.has(paneId)) {
      const session = editorPaneSessions.get(paneId);
      editorPaneSessions.delete(paneId);
      if (session) {
        browserSessionManager?.unregisterTrustedLocalOrigin(session.url);
        vscodeServerManager.release(session.folder);
      }
    }
    browserPaneManager.destroyPane(paneId);
  });

  safeOn("editor:setKeepServerRunning", (_event, keep: unknown) => {
    if (typeof keep !== "boolean") return;
    vscodeServerManager.keepRunning = keep;
  });

  safeHandle("t3code:isAvailable", () => {
    return t3codeServerManager.isAvailable();
  });

  safeHandle("t3code:start", async (_event, paneId: unknown) => {
    if (typeof paneId !== "string") {
      return { error: "Invalid arguments" };
    }

    try {
      const { url } = await t3codeServerManager.start();
      const existingUrl = t3codePaneUrls.get(paneId);
      if (existingUrl) {
        browserSessionManager?.unregisterTrustedLocalOrigin(existingUrl);
      }

      t3codePaneUrls.set(paneId, url);
      browserSessionManager?.registerTrustedLocalOrigin(url);
      browserPaneManager.createPane(paneId, url, "t3code");
      return { url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  safeHandle("t3code:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    const url = t3codePaneUrls.get(paneId);
    t3codePaneUrls.delete(paneId);
    if (url) {
      browserSessionManager?.unregisterTrustedLocalOrigin(url);
    }
    t3codeServerManager.release();
    browserPaneManager.destroyPane(paneId);
  });

  terminalManager.onTitleChanged((surfaceId, title) => {
    mainWindow.webContents.send("terminal:titleChanged", surfaceId, title);
  });

  terminalManager.onSurfaceClosed((surfaceId) => {
    mainWindow.webContents.send("terminal:closed", surfaceId);
  });

  terminalManager.onSurfaceFocused((surfaceId) => {
    mainWindow.webContents.send("terminal:focused", surfaceId);
  });

  terminalManager.onModifierChanged((modifier) => {
    mainWindow.webContents.send("window:nativeModifierChanged", modifier);
  });

  terminalManager.onPwdChanged((surfaceId, pwd) => {
    mainWindow.webContents.send("terminal:pwdChanged", surfaceId, pwd);
  });

  terminalManager.onSearchStart((surfaceId, needle) => {
    mainWindow.webContents.send("terminal:searchStart", surfaceId, needle);
  });

  terminalManager.onSearchEnd((surfaceId) => {
    mainWindow.webContents.send("terminal:searchEnd", surfaceId);
  });

  terminalManager.onSearchTotal((surfaceId, total) => {
    mainWindow.webContents.send("terminal:searchTotal", surfaceId, total);
  });

  terminalManager.onSearchSelected((surfaceId, selected) => {
    mainWindow.webContents.send("terminal:searchSelected", surfaceId, selected);
  });
}

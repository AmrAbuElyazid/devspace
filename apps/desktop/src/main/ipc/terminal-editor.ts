import type { BrowserWindow } from "electron";
import path from "path";
import type { BrowserPaneController } from "../browser/browser-types";
import type { BrowserSessionManager } from "../browser/browser-session-manager";
import { safeHandle, safeOn } from "./shared";
import type { T3CodeServerManager } from "../t3code-server";
import type { TerminalManager } from "../terminal-manager";
import { parseNativeViewBounds } from "../validation";
import type { VscodeServerManager } from "../vscode-server";

const MAX_TERMINAL_ENV_VARS = 100;
const MAX_TERMINAL_ENV_KEY_LENGTH = 128;
const MAX_TERMINAL_ENV_VALUE_LENGTH = 8192;
const MAX_TERMINAL_CWD_LENGTH = 4096;
const MAX_TMUX_VALUE_LENGTH = 4096;
const MAX_EDITOR_CLI_LENGTH = 4096;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_EDITOR_CLI_COMMANDS = new Set(["code", "code-insiders"]);

function parseTerminalCwd(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0 || value.length > MAX_TERMINAL_CWD_LENGTH) return undefined;
  return value;
}

function parseTerminalEnvVars(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const envVars: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(envVars).length >= MAX_TERMINAL_ENV_VARS) break;
    if (key.length === 0 || key.length > MAX_TERMINAL_ENV_KEY_LENGTH) continue;
    if (!ENV_KEY_PATTERN.test(key)) continue;
    if (typeof rawValue !== "string" || rawValue.length > MAX_TERMINAL_ENV_VALUE_LENGTH) continue;
    envVars[key] = rawValue;
  }

  return Object.keys(envVars).length > 0 ? envVars : undefined;
}

function parseManagedSessionId(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return undefined;
  return value;
}

function parseExternalTmuxValue(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TMUX_VALUE_LENGTH) {
    return undefined;
  }
  return value.includes("\0") || value.includes("\r") || value.includes("\n") ? undefined : value;
}

function nextGeneration(generations: Map<string, number>, paneId: string): number {
  const generation = (generations.get(paneId) ?? 0) + 1;
  generations.set(paneId, generation);
  return generation;
}

function parseConfiguredEditorCli(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EDITOR_CLI_LENGTH) return undefined;
  if (trimmed.includes("\0")) return undefined;

  if (!trimmed.includes("/") && !trimmed.startsWith(".")) {
    return ALLOWED_EDITOR_CLI_COMMANDS.has(trimmed) ? trimmed : undefined;
  }

  if (!path.isAbsolute(trimmed)) return undefined;
  return ALLOWED_EDITOR_CLI_COMMANDS.has(path.basename(trimmed)) ? trimmed : undefined;
}

export function registerTerminalAndEditorIpc(
  mainWindow: BrowserWindow,
  terminalManager: TerminalManager,
  browserPaneManager: BrowserPaneController,
  vscodeServerManager: VscodeServerManager,
  t3codeServerManager: T3CodeServerManager,
  editorSessionManager?: Pick<
    BrowserSessionManager,
    "registerTrustedLocalOrigin" | "unregisterTrustedLocalOrigin"
  >,
  browserSessionManager?: Pick<
    BrowserSessionManager,
    "registerTrustedLocalOrigin" | "unregisterTrustedLocalOrigin"
  >,
): void {
  // Renderer generation per live surface, echoed back on "terminal:closed" so
  // the renderer can drop a close that was already in flight when the surface
  // was replaced. Keyed by surface ID, which the renderer reuses across
  // recreates, so the entry is always overwritten by the newest incarnation.
  const surfaceGenerations = new Map<string, number>();

  safeHandle(
    "terminal:create",
    async (_event, surfaceId: unknown, options: unknown, generation: unknown) => {
      if (typeof surfaceId !== "string") {
        return { error: "Invalid terminal surface ID" } as const;
      }
      const opts =
        typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
      const cwd = parseTerminalCwd(opts["cwd"]);
      const envVars = parseTerminalEnvVars(opts["envVars"]);

      const createOpts: import("../../shared/types").TerminalCreateOptions = {};
      if (cwd) createOpts.cwd = cwd;
      if (envVars) createOpts.envVars = envVars;

      if (opts["backend"] === "managed-tmux") {
        const sessionId = parseManagedSessionId(opts["sessionId"]);
        if (!sessionId) return { error: "Invalid managed terminal session ID" } as const;
        Object.assign(createOpts, { backend: "managed-tmux", sessionId });
      } else if (opts["backend"] === "external-tmux") {
        const sessionName = parseExternalTmuxValue(opts["sessionName"]);
        if (!sessionName) return { error: "Invalid external tmux session name" } as const;
        const socketPath = parseExternalTmuxValue(opts["socketPath"]);
        Object.assign(createOpts, {
          backend: "external-tmux",
          sessionName,
          ...(socketPath ? { socketPath } : {}),
        });
      }

      try {
        await terminalManager.createSurface(
          surfaceId,
          Object.keys(createOpts).length > 0 ? createOpts : undefined,
        );
        if (typeof generation === "number" && Number.isFinite(generation)) {
          surfaceGenerations.set(surfaceId, generation);
        } else {
          surfaceGenerations.delete(surfaceId);
        }
        return { ok: true } as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message } as const;
      }
    },
  );

  safeHandle("terminal:killManagedSession", async (_event, sessionId: unknown) => {
    const safeSessionId = parseManagedSessionId(sessionId);
    if (!safeSessionId) return { error: "Invalid managed terminal session ID" } as const;
    try {
      return { killed: await terminalManager.killManagedSession(safeSessionId) } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  });

  safeHandle("terminal:listManagedSessions", async () => {
    try {
      return { sessions: await terminalManager.listManagedSessions() } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  });

  safeHandle("terminal:destroy", (_event, surfaceId: unknown) => {
    if (typeof surfaceId !== "string") return;
    surfaceGenerations.delete(surfaceId);
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
    if (typeof surfaceId !== "string") return;
    const nextBounds = parseNativeViewBounds(bounds);
    if (!nextBounds) return;

    terminalManager.setBounds(surfaceId, nextBounds);
  });

  const editorPaneSessions = new Map<string, { folder: string | undefined; url: string }>();
  const t3codePaneUrls = new Map<string, string>();
  const editorPaneGenerations = new Map<string, number>();
  const t3codePaneGenerations = new Map<string, number>();

  safeHandle("editor:isAvailable", (_event, configuredCli: unknown) => {
    return vscodeServerManager.isAvailable(parseConfiguredEditorCli(configuredCli));
  });

  safeHandle("editor:getCliStatus", (_event, configuredCli: unknown) => {
    return vscodeServerManager.getCliStatus(parseConfiguredEditorCli(configuredCli));
  });

  safeHandle(
    "editor:start",
    async (_event, paneId: unknown, folderPath: unknown, configuredCli: unknown) => {
      if (typeof paneId !== "string") {
        return { error: "Invalid arguments" };
      }

      const folder = typeof folderPath === "string" ? folderPath : undefined;
      const preferredCli = parseConfiguredEditorCli(configuredCli);
      const generation = nextGeneration(editorPaneGenerations, paneId);
      try {
        const existingSession = editorPaneSessions.get(paneId);
        if (existingSession && existingSession.folder === folder) {
          browserPaneManager.createPane(paneId, existingSession.url, "editor");
          return { url: existingSession.url };
        }

        const { url } = await vscodeServerManager.start(folder, preferredCli);
        if (editorPaneGenerations.get(paneId) !== generation) {
          // A newer start (or a stop) for this pane superseded us while the
          // server was coming up. That is routine, not a failure — reporting it
          // as an error puts a "Failed to start" card in front of the user.
          vscodeServerManager.release(folder);
          return { cancelled: true } as const;
        }
        if (existingSession) {
          editorSessionManager?.unregisterTrustedLocalOrigin(existingSession.url);
          vscodeServerManager.release(existingSession.folder);
        }

        editorPaneSessions.set(paneId, { folder, url });
        editorSessionManager?.registerTrustedLocalOrigin(url);
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
    nextGeneration(editorPaneGenerations, paneId);
    if (editorPaneSessions.has(paneId)) {
      const session = editorPaneSessions.get(paneId);
      editorPaneSessions.delete(paneId);
      if (session) {
        editorSessionManager?.unregisterTrustedLocalOrigin(session.url);
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
      const generation = nextGeneration(t3codePaneGenerations, paneId);
      const existingUrl = t3codePaneUrls.get(paneId);
      if (existingUrl) {
        browserPaneManager.createPane(paneId, existingUrl, "t3code");
        return { url: existingUrl };
      }

      const { url } = await t3codeServerManager.start();
      if (t3codePaneGenerations.get(paneId) !== generation) {
        // Superseded by a newer start or a stop — routine, not a failure.
        t3codeServerManager.release();
        return { cancelled: true } as const;
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
    nextGeneration(t3codePaneGenerations, paneId);
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
    const generation = surfaceGenerations.get(surfaceId) ?? null;
    surfaceGenerations.delete(surfaceId);
    mainWindow.webContents.send("terminal:closed", surfaceId, generation);
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

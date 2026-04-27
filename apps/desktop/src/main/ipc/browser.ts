import type { BrowserWindow } from "electron";
import type {
  BrowserBounds,
  BrowserFindInPageOptions,
  BrowserImportMode,
  BrowserImportSource,
  BrowserPermissionDecision,
  BrowserStopFindAction,
  ClearBrowsingDataTarget,
} from "../../shared/browser";
import type { BrowserImportService } from "../browser/browser-import-service";
import type { BrowserPaneController } from "../browser/browser-types";
import {
  findHostViewBounds,
  translateRendererBoundsToContentBounds,
} from "../browser/browser-view-bounds";
import { getSafeBrowserUrl, parseNativeViewBounds } from "../validation";
import { safeHandle, safeOn } from "./shared";

function parseBrowserImportMode(mode: unknown): BrowserImportMode | null {
  if (mode === undefined) return "everything";
  if (mode === "cookies" || mode === "history" || mode === "everything") return mode;
  return null;
}

function parseBrowserImportSource(value: unknown): BrowserImportSource | null {
  if (value === "chrome" || value === "arc" || value === "safari" || value === "zen") {
    return value;
  }
  return null;
}

function parseClearBrowsingDataTarget(value: unknown): ClearBrowsingDataTarget | null {
  if (value === "cookies" || value === "history" || value === "cache" || value === "everything") {
    return value;
  }
  return null;
}

export function registerBrowserIpc(
  mainWindow: BrowserWindow,
  browserPaneManager: BrowserPaneController,
  browserImportService?: BrowserImportService,
): void {
  safeHandle("browser:create", (_event, paneId: unknown, url: unknown) => {
    if (typeof paneId !== "string") return;
    const safeUrl = getSafeBrowserUrl(url);
    if (!safeUrl) return;
    browserPaneManager.createPane(paneId, safeUrl);
  });

  safeHandle("browser:destroy", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.destroyPane(paneId);
  });

  safeHandle("browser:show", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.showPane(paneId);
  });

  safeHandle("browser:hide", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.hidePane(paneId);
  });

  safeOn("browser:setVisiblePanes", (_event, paneIds: unknown) => {
    if (!Array.isArray(paneIds)) return;
    const valid = paneIds.filter((id): id is string => typeof id === "string");
    browserPaneManager.setVisiblePanes(valid);
  });

  safeHandle("browser:getRuntimeState", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return undefined;
    return browserPaneManager.getRuntimeState(paneId);
  });

  safeHandle("browser:navigate", (_event, paneId: unknown, url: unknown) => {
    if (typeof paneId !== "string") return;
    const safeUrl = getSafeBrowserUrl(url);
    if (!safeUrl) return;
    browserPaneManager.navigate(paneId, safeUrl);
  });

  safeHandle("browser:back", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.back(paneId);
  });

  safeHandle("browser:forward", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.forward(paneId);
  });

  safeHandle("browser:reload", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.reload(paneId);
  });

  safeHandle("browser:stop", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.stop(paneId);
  });

  safeOn("browser:setBounds", (event, paneId: unknown, bounds: unknown) => {
    if (typeof paneId !== "string") return;
    const nextBounds = parseNativeViewBounds(bounds);
    if (!nextBounds) return;

    const rendererHostBounds = findHostViewBounds(mainWindow.contentView, event.sender.id);
    const translatedBounds = translateRendererBoundsToContentBounds(
      nextBounds as BrowserBounds,
      rendererHostBounds,
    );
    browserPaneManager.setBounds(paneId, translatedBounds);
  });

  safeOn("browser:setFocus", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.focusPane(paneId);
  });

  safeHandle("browser:setZoom", (_event, paneId: unknown, zoom: unknown) => {
    if (typeof paneId !== "string" || typeof zoom !== "number" || !isFinite(zoom)) return;
    browserPaneManager.setZoom(paneId, zoom);
  });

  safeHandle("browser:resetZoom", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.resetZoom(paneId);
  });

  safeHandle(
    "browser:findInPage",
    (_event, paneId: unknown, query: unknown, options?: BrowserFindInPageOptions) => {
      if (typeof paneId !== "string" || typeof query !== "string") return;
      browserPaneManager.findInPage(paneId, query, options);
    },
  );

  safeHandle(
    "browser:stopFindInPage",
    (_event, paneId: unknown, action?: BrowserStopFindAction) => {
      if (typeof paneId !== "string") return;
      browserPaneManager.stopFindInPage(paneId, action);
    },
  );

  safeHandle("browser:toggleDevTools", (_event, paneId: unknown) => {
    if (typeof paneId !== "string") return;
    browserPaneManager.toggleDevTools(paneId);
  });

  safeHandle("browser:showContextMenu", (_event, paneId: unknown, position?: unknown) => {
    if (typeof paneId !== "string") return;
    if (position && (typeof position !== "object" || position === null)) return;

    let nextPosition: { x: number; y: number } | undefined;
    if (position && typeof position === "object" && position !== null) {
      const next = position as Partial<{ x: number; y: number }>;
      if (typeof next.x === "number" && typeof next.y === "number") {
        nextPosition = { x: next.x, y: next.y };
      }
    }

    browserPaneManager.showContextMenu(paneId, nextPosition);
  });

  safeHandle("browser:resolvePermission", (_event, requestToken: unknown, decision: unknown) => {
    if (typeof requestToken !== "string") return;
    if (decision !== "allow-once" && decision !== "allow-for-session" && decision !== "deny") {
      return;
    }
    browserPaneManager.resolvePermission(requestToken, decision as BrowserPermissionDecision);
  });

  safeHandle("browser:listProfiles", async (_event, browser: unknown) => {
    const source = parseBrowserImportSource(browser);
    if (!source || !browserImportService) {
      return [];
    }

    return browserImportService.listProfiles(source);
  });

  safeHandle(
    "browser:import",
    async (_event, browser: unknown, profilePath: unknown, mode?: unknown) => {
      const source = parseBrowserImportSource(browser);
      if (!source || !browserImportService) {
        return {
          ok: false,
          code: "INVALID_BROWSER_IMPORT_SOURCE",
          importedCookies: 0,
          importedHistory: 0,
        };
      }

      const importMode = parseBrowserImportMode(mode);
      if (!importMode) {
        return {
          ok: false,
          code: "INVALID_BROWSER_IMPORT_MODE",
          importedCookies: 0,
          importedHistory: 0,
        };
      }

      const normalizedProfilePath = typeof profilePath === "string" ? profilePath : null;
      if (normalizedProfilePath) {
        const allowedProfiles = await browserImportService.listProfiles(source);
        if (!allowedProfiles.some((profile) => profile.path === normalizedProfilePath)) {
          return {
            ok: false,
            code: "INVALID_BROWSER_PROFILE",
            importedCookies: 0,
            importedHistory: 0,
          };
        }
      }

      return browserImportService.importBrowser(source, normalizedProfilePath, importMode);
    },
  );

  safeHandle("browser:detectAccess", async (_event, browser: unknown, mode?: unknown) => {
    const source = parseBrowserImportSource(browser);
    const importMode = parseBrowserImportMode(mode);
    if (!source || !importMode) {
      return {
        ok: false,
        code: "INVALID_BROWSER_IMPORT_SOURCE",
        message: "Invalid browser or import mode.",
      };
    }

    return (
      browserImportService?.detectAccess(source, importMode) ?? {
        ok: false,
        code: "BROWSER_IMPORT_UNAVAILABLE",
        message: "Browser import service unavailable.",
      }
    );
  });

  safeHandle("browser:clearData", async (_event, target: unknown) => {
    const clearTarget = parseClearBrowsingDataTarget(target);
    if (!clearTarget || !browserImportService) {
      return { ok: false, error: "Invalid clear data target." };
    }

    return browserImportService.clearBrowsingData(clearTarget);
  });
}

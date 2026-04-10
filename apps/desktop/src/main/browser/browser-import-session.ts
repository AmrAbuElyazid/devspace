import type { Cookie as SweetCookie } from "@steipete/sweet-cookie";
import type { BrowserHistoryRecorder } from "./browser-history-service";
import {
  rollbackImportedCookies,
  snapshotExistingCookies,
  type BrowserCookieStore,
} from "./browser-import-cookie-store";
import { toElectronCookieInput, type ImportedCookieInput } from "./browser-import-electron-cookies";
import { BrowserImportServiceError } from "./browser-import-errors";

type ImportedBrowserCookie = SweetCookie & {
  host?: string;
  hostOnly?: boolean;
  expiresAt?: number | null;
};

export type BrowserCookieSession = {
  cookies: BrowserCookieStore;
};

export type BrowsingDataSession = BrowserCookieSession & {
  clearStorageData: (options?: { storages?: string[] }) => Promise<void>;
  clearCache: () => Promise<void>;
};

export async function clearSessionBrowsingData(
  session: BrowsingDataSession,
  historyService: Pick<BrowserHistoryRecorder, "clearAll">,
  target: "cookies" | "history" | "cache" | "everything",
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (target === "cookies" || target === "everything") {
      await session.clearStorageData({ storages: ["cookies"] });
    }

    if (target === "history" || target === "everything") {
      historyService.clearAll();
    }

    if (target === "cache" || target === "everything") {
      await session.clearCache();
      await session.clearStorageData({
        storages: ["cachestorage", "serviceworkers"],
      });
    }

    if (target === "everything") {
      await session.clearStorageData({
        storages: ["localstorage", "indexdb", "websql", "shadercache"],
      });
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function importCookiesToSession(
  session: BrowserCookieSession,
  cookies: ImportedBrowserCookie[],
): Promise<number> {
  const electronCookies = cookies.map(
    (cookie) => toElectronCookieInput(cookie) as ImportedCookieInput,
  );
  const appliedCookies: ImportedCookieInput[] = [];
  const previousCookies = await snapshotExistingCookies(session.cookies, electronCookies);

  try {
    for (const cookie of electronCookies) {
      await session.cookies.set(cookie);
      appliedCookies.push(cookie);
    }

    if (electronCookies.length > 0) {
      await session.cookies.flushStore();
    }

    return electronCookies.length;
  } catch (error) {
    await rollbackImportedCookies(session.cookies, appliedCookies, previousCookies);
    throw new BrowserImportServiceError(
      "COOKIE_WRITE_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }
}

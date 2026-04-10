import type { BrowserContextMenuTarget } from "../../shared/browser";
import {
  findShortcutBinding,
  resolveNativeModifier,
  shouldIgnoreMenuShortcuts,
  toStoredShortcut,
} from "./browser-web-shortcuts";
import type {
  BrowserPaneManagerDeps,
  BrowserPaneRecord,
  BrowserRuntimePatch,
  BrowserShortcutBinding,
} from "./browser-types";

type WebContentsEventEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type FoundInPageResult = {
  activeMatchOrdinal?: number;
  matches?: number;
};

const POINTER_DRIVEN_FOCUS_WINDOW_MS = 1_000;

function normalizeContextMenuText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getContextMenuTarget(params: {
  linkURL?: unknown;
  selectionText?: unknown;
}): BrowserContextMenuTarget {
  if (normalizeContextMenuText(params.linkURL)) {
    return "link";
  }

  if (normalizeContextMenuText(params.selectionText)) {
    return "selection";
  }

  return "page";
}

type BrowserPaneWebContentsListenerDeps = {
  pane: BrowserPaneRecord;
  sendToRenderer: BrowserPaneManagerDeps["sendToRenderer"];
  getAppShortcutBindings: (() => BrowserShortcutBinding[]) | undefined;
  applyRuntimePatch: (paneId: string, patch: BrowserRuntimePatch) => void;
  applyFindResult: (
    paneId: string,
    result: { query: string; activeMatch: number; totalMatches: number },
  ) => void;
  syncNavigationState: (pane: BrowserPaneRecord) => void;
  recordCommittedHistoryVisit: (pane: BrowserPaneRecord, url: string) => void;
  refreshPendingHistoryTitle: (pane: BrowserPaneRecord, title: string) => void;
};

export function registerBrowserPaneWebContentsListeners({
  pane,
  sendToRenderer,
  getAppShortcutBindings,
  applyRuntimePatch,
  applyFindResult,
  syncNavigationState,
  recordCommittedHistoryVisit,
  refreshPendingHistoryTitle,
}: BrowserPaneWebContentsListenerDeps): void {
  let lastPointerDownAt = 0;
  const webContents = pane.view.webContents as Electron.WebContents &
    Partial<WebContentsEventEmitter>;
  const setWindowOpenHandler = (
    webContents as {
      setWindowOpenHandler?: (
        handler: (details: { url: string }) => { action: "deny" | "allow" },
      ) => void;
    }
  ).setWindowOpenHandler;
  if (typeof setWindowOpenHandler === "function") {
    setWindowOpenHandler.call(webContents, (details: { url: string }) => {
      sendToRenderer("browser:openInNewTabRequested", {
        paneId: pane.runtimeState.paneId,
        url: details.url,
      });
      return { action: "deny" };
    });
  }

  if (typeof webContents?.on !== "function") {
    return;
  }

  webContents.on("console-message", (event: unknown) => {
    const evt = event as { level?: number; message?: string };
    const level = evt.level ?? 0;
    const message = evt.message ?? "";

    if (!message.startsWith("[devspace")) return;

    const prefix = `[webview:${pane.runtimeState.paneId}]`;
    if (level >= 3) console.error(prefix, message);
    else if (level === 2) console.warn(prefix, message);
    else console.log(prefix, message);
  });

  webContents.on("did-start-loading", () => {
    applyRuntimePatch(pane.runtimeState.paneId, { isLoading: true, failure: null });
  });

  webContents.on("before-mouse-event", (_event: unknown, mouseInput: unknown) => {
    const type =
      typeof mouseInput === "object" && mouseInput !== null && "type" in mouseInput
        ? mouseInput.type
        : undefined;
    if (type === "mouseDown") {
      lastPointerDownAt = Date.now();
    }
  });

  webContents.on("focus", () => {
    if (Date.now() - lastPointerDownAt > POINTER_DRIVEN_FOCUS_WINDOW_MS) {
      return;
    }

    lastPointerDownAt = 0;
    sendToRenderer("browser:focused", pane.runtimeState.paneId);
  });

  webContents.on("blur", () => {
    sendToRenderer("window:nativeModifierChanged", null);
  });

  webContents.on(
    "before-input-event",
    (event: unknown, input: Parameters<typeof toStoredShortcut>[0]) => {
      const setIgnoreMenuShortcuts = (
        webContents as {
          setIgnoreMenuShortcuts?: (ignore: boolean) => void;
        }
      ).setIgnoreMenuShortcuts;

      const shortcut = toStoredShortcut(input);
      sendToRenderer("window:nativeModifierChanged", resolveNativeModifier(input, shortcut));

      if (input.type !== "keyDown" || !shortcut) {
        if (typeof setIgnoreMenuShortcuts === "function") {
          setIgnoreMenuShortcuts.call(webContents, shouldIgnoreMenuShortcuts(pane.kind, input));
        }
        return;
      }

      const binding = findShortcutBinding(getAppShortcutBindings?.(), pane.kind, shortcut);
      if (!binding) {
        if (typeof setIgnoreMenuShortcuts === "function") {
          setIgnoreMenuShortcuts.call(webContents, shouldIgnoreMenuShortcuts(pane.kind, input));
        }
        return;
      }

      if (typeof setIgnoreMenuShortcuts === "function") {
        setIgnoreMenuShortcuts.call(webContents, true);
      }

      const preventDefault = (event as { preventDefault?: () => void }).preventDefault;
      if (typeof preventDefault === "function") {
        preventDefault.call(event);
      }

      sendToRenderer(binding.channel, ...(binding.args ?? []));
    },
  );

  webContents.on("did-stop-loading", () => {
    syncNavigationState(pane);
    applyRuntimePatch(pane.runtimeState.paneId, {
      isLoading: false,
      canGoBack: pane.runtimeState.canGoBack,
      canGoForward: pane.runtimeState.canGoForward,
    });
  });

  webContents.on("did-navigate", (_event: unknown, url: string) => {
    syncNavigationState(pane);
    recordCommittedHistoryVisit(pane, url);
    applyRuntimePatch(pane.runtimeState.paneId, {
      url,
      canGoBack: pane.runtimeState.canGoBack,
      canGoForward: pane.runtimeState.canGoForward,
      isLoading: false,
      failure: null,
    });
  });

  webContents.on("did-navigate-in-page", (_event: unknown, url: string) => {
    syncNavigationState(pane);
    recordCommittedHistoryVisit(pane, url);
    applyRuntimePatch(pane.runtimeState.paneId, {
      url,
      canGoBack: pane.runtimeState.canGoBack,
      canGoForward: pane.runtimeState.canGoForward,
      failure: null,
    });
  });

  webContents.on("page-title-updated", (_event: unknown, title: string) => {
    const nextTitle = title || "Browser";
    applyRuntimePatch(pane.runtimeState.paneId, { title: nextTitle });
    refreshPendingHistoryTitle(pane, nextTitle);
  });

  webContents.on("page-favicon-updated", (_event: unknown, favicons: string[]) => {
    applyRuntimePatch(pane.runtimeState.paneId, { faviconUrl: favicons[0] ?? null });
  });

  webContents.on("context-menu", (event: unknown, params: unknown) => {
    const preventDefault = (event as { preventDefault?: () => void })?.preventDefault;
    if (typeof preventDefault === "function") {
      preventDefault.call(event);
    }

    const nextParams =
      typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
    const paneBounds = pane.bounds ?? { x: 0, y: 0 };
    const x = typeof nextParams.x === "number" ? nextParams.x : 0;
    const y = typeof nextParams.y === "number" ? nextParams.y : 0;
    const linkUrl = normalizeContextMenuText(nextParams.linkURL);
    const selectionText = normalizeContextMenuText(nextParams.selectionText);
    const target = getContextMenuTarget(nextParams);

    syncNavigationState(pane);
    sendToRenderer("browser:contextMenuRequested", {
      paneId: pane.runtimeState.paneId,
      position: {
        x: paneBounds.x + x,
        y: paneBounds.y + y,
      },
      target,
      pageUrl: pane.runtimeState.url,
      linkUrl,
      selectionText,
      canGoBack: pane.runtimeState.canGoBack,
      canGoForward: pane.runtimeState.canGoForward,
    });
  });

  webContents.on("found-in-page", (_event: unknown, result: FoundInPageResult) => {
    const query = pane.runtimeState.find?.query;
    if (!query) {
      return;
    }

    applyFindResult(pane.runtimeState.paneId, {
      query,
      activeMatch: result.activeMatchOrdinal ?? 0,
      totalMatches: result.matches ?? 0,
    });
  });

  webContents.on(
    "did-fail-load",
    (
      _event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame?: boolean,
    ) => {
      if (isMainFrame === false) {
        return;
      }

      if (errorCode === -3) {
        applyRuntimePatch(pane.runtimeState.paneId, {
          isLoading: false,
        });
        return;
      }

      const securityPatch =
        errorCode <= -200 && errorCode >= -299
          ? { isSecure: false, securityLabel: "Certificate error" as const }
          : {};

      syncNavigationState(pane);
      applyRuntimePatch(pane.runtimeState.paneId, {
        title: errorDescription || "Navigation failed",
        faviconUrl: null,
        isLoading: false,
        canGoBack: pane.runtimeState.canGoBack,
        canGoForward: pane.runtimeState.canGoForward,
        failure: {
          kind: "navigation",
          detail: errorDescription || "Navigation failed",
          url: validatedURL,
        },
        ...securityPatch,
      });
    },
  );

  webContents.on("render-process-gone", (_event: unknown, details: { reason?: string }) => {
    applyRuntimePatch(pane.runtimeState.paneId, {
      title: "Browser pane crashed",
      faviconUrl: null,
      isLoading: false,
      failure: {
        kind: "crash",
        detail: details.reason ?? "gone",
        url: pane.runtimeState.url,
      },
    });
  });
}

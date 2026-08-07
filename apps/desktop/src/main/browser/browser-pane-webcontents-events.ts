import type { BrowserContextMenuTarget } from "../../shared/browser";
import {
  findEditorWebZoomShortcutBinding,
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
import type { StoredShortcut } from "../../shared/shortcuts";

type WebContentsEventEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type FocusableWebContents = {
  isFocused?: () => boolean;
};

type FoundInPageResult = {
  activeMatchOrdinal?: number;
  matches?: number;
};

const POINTER_DRIVEN_FOCUS_WINDOW_MS = 1_000;

type EditableWebContents = {
  copy?: () => void;
  paste?: () => void;
  cut?: () => void;
  selectAll?: () => void;
};

function handleEditorNativeEditShortcut(
  webContents: EditableWebContents,
  shortcut: StoredShortcut,
): boolean {
  if (shortcut.option || (shortcut.command && shortcut.control)) {
    return false;
  }

  const hasPrimaryModifier = shortcut.command || shortcut.control;
  if (!hasPrimaryModifier) {
    return false;
  }

  if (!shortcut.shift && shortcut.key === "c" && typeof webContents.copy === "function") {
    webContents.copy();
    return true;
  }

  if (!shortcut.shift && shortcut.key === "v" && typeof webContents.paste === "function") {
    webContents.paste();
    return true;
  }

  if (!shortcut.shift && shortcut.key === "x" && typeof webContents.cut === "function") {
    webContents.cut();
    return true;
  }

  return false;
}

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
  srcURL?: unknown;
  mediaType?: unknown;
}): BrowserContextMenuTarget {
  // Selection wins over everything: text highlighted inside a link means the
  // user is after the text, not the link.
  if (normalizeContextMenuText(params.selectionText)) {
    return "selection";
  }

  if (normalizeContextMenuText(params.linkURL)) {
    return "link";
  }

  if (params.mediaType === "image" && normalizeContextMenuText(params.srcURL)) {
    return "image";
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
  goBack: (pane: BrowserPaneRecord) => void;
  goForward: (pane: BrowserPaneRecord) => void;
  enableVisualZoom: (pane: BrowserPaneRecord) => void;
  recordCommittedHistoryVisit: (pane: BrowserPaneRecord, url: string) => void;
  refreshPendingHistoryTitle: (pane: BrowserPaneRecord, title: string) => void;
  /**
   * Attempt an automatic reload after a renderer crash. Returns false when the
   * pane has exhausted its retry budget, which is this module's cue to surface
   * the failure card instead.
   */
  recoverFromCrash: (pane: BrowserPaneRecord) => boolean;
};

export function registerBrowserPaneWebContentsListeners({
  pane,
  sendToRenderer,
  getAppShortcutBindings,
  applyRuntimePatch,
  applyFindResult,
  syncNavigationState,
  goBack,
  goForward,
  enableVisualZoom,
  recordCommittedHistoryVisit,
  refreshPendingHistoryTitle,
  recoverFromCrash,
}: BrowserPaneWebContentsListenerDeps): void {
  let lastPointerDownAt = 0;
  const webContents = pane.view.webContents as Electron.WebContents &
    Partial<WebContentsEventEmitter> &
    FocusableWebContents;
  const setIgnoreMenuShortcuts = (
    webContents as {
      setIgnoreMenuShortcuts?: (ignore: boolean) => void;
    }
  ).setIgnoreMenuShortcuts;
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

  enableVisualZoom(pane);

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
    const input =
      typeof mouseInput === "object" && mouseInput !== null
        ? (mouseInput as { type?: unknown; button?: unknown })
        : {};
    const type = input.type;

    if (type === "mouseUp") {
      // The thumb buttons on a mouse. Chromium hands them to the page and then
      // leaves the navigation itself to the embedder — that half is Chrome's
      // own browser UI, which Electron does not come with, so it lands here.
      // On release rather than press, matching where Chromium puts it, and for
      // browser panes only: an editor pane's history belongs to the IDE, not to
      // a page. The page still sees the event, exactly as it does in Chrome.
      if (pane.kind === "browser") {
        if (input.button === "back") {
          goBack(pane);
        } else if (input.button === "forward") {
          goForward(pane);
        }
      }

      // A WebContentsView sits above the renderer and consumes the events in
      // its bounds, so a drag released over one never reaches dnd-kit and gets
      // stuck. The drag shield normally hides these views for the duration of a
      // drag; this is the net for when it doesn't. Ghostty terminals are native
      // NSViews with no equivalent hook, so they aren't covered.
      sendToRenderer("window:nativePointerRelease");
      return;
    }

    if (type === "mouseDown") {
      if (typeof webContents.isFocused === "function" && webContents.isFocused()) {
        lastPointerDownAt = 0;
        sendToRenderer("browser:focused", pane.runtimeState.paneId);
        return;
      }

      lastPointerDownAt = Date.now();
    }
  });

  webContents.on("focus", () => {
    if (typeof setIgnoreMenuShortcuts === "function") {
      setIgnoreMenuShortcuts.call(
        webContents,
        shouldIgnoreMenuShortcuts(pane.kind, { meta: false, control: false }),
      );
    }

    if (Date.now() - lastPointerDownAt > POINTER_DRIVEN_FOCUS_WINDOW_MS) {
      return;
    }

    lastPointerDownAt = 0;
    sendToRenderer("browser:focused", pane.runtimeState.paneId);
  });

  webContents.on("blur", () => {
    lastPointerDownAt = 0;
    if (typeof setIgnoreMenuShortcuts === "function") {
      setIgnoreMenuShortcuts.call(webContents, false);
    }
    // Deliberately does NOT report the modifier as released. A pane blurs on
    // every workspace switch, and ⌘ is still physically down during a
    // ⌘1 → ⌘2 → ⌘1 run; clearing here dropped the shortcut hints and nothing
    // restored them, because the pane that regained focus saw no new modifier
    // transition to report. A genuine release still arrives via
    // before-input-event, the terminal's flagsChanged, or — if the whole
    // window loses focus — the renderer's own blur handler.
  });

  webContents.on(
    "before-input-event",
    (event: unknown, input: Parameters<typeof toStoredShortcut>[0]) => {
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
        const editorZoomBinding =
          pane.kind === "editor"
            ? findEditorWebZoomShortcutBinding(getAppShortcutBindings?.(), shortcut)
            : undefined;
        if (editorZoomBinding) {
          const preventDefault = (event as { preventDefault?: () => void }).preventDefault;
          if (typeof preventDefault === "function") {
            preventDefault.call(event);
          }

          sendToRenderer(editorZoomBinding.channel, ...(editorZoomBinding.args ?? []));
          return;
        }

        if (pane.kind === "editor" && handleEditorNativeEditShortcut(webContents, shortcut)) {
          const preventDefault = (event as { preventDefault?: () => void }).preventDefault;
          if (typeof preventDefault === "function") {
            preventDefault.call(event);
          }
        }

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
    // Re-applied per navigation, the same reason the window's own zoom reset
    // is: these limits belong to the page that was loaded when they were set,
    // and the next document starts again without them.
    enableVisualZoom(pane);
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
    const imageUrl =
      nextParams.mediaType === "image" ? normalizeContextMenuText(nextParams.srcURL) : null;
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
      imageUrl,
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
    // A clean exit is the pane being torn down, not a crash to recover from.
    if (details.reason === "clean-exit") {
      return;
    }

    if (recoverFromCrash(pane)) {
      // Keep the last known title and favicon: the pane is coming back at the
      // same URL, and blanking its tab mid-reload reads as a lost pane.
      applyRuntimePatch(pane.runtimeState.paneId, { isLoading: true, failure: null });
      return;
    }

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

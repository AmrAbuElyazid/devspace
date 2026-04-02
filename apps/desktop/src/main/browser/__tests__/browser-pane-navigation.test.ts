import { expect, test } from "vitest";
import {
  focusPaneWebContents,
  goBackInPane,
  goForwardInPane,
  recordCommittedHistoryVisit,
  refreshPendingHistoryTitle,
  reloadPane,
  setPaneZoomFactor,
  stopPane,
  syncPaneNavigationState,
} from "../browser-pane-navigation";
import type { BrowserPaneManagerDeps, BrowserPaneRecord } from "../browser-types";

function makePane(): BrowserPaneRecord {
  return {
    view: {
      webContents: {
        goBack: () => {},
        goForward: () => {},
        reload: () => {},
        stop: () => {},
        focus: () => {},
        setZoomFactor: () => Promise.resolve(),
      },
    } as never,
    kind: "browser",
    runtimeState: {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Browser",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: null,
      failure: null,
    },
    bounds: null,
    isVisible: false,
  };
}

test("navigation helpers prefer navigationHistory over deprecated webContents navigation methods", () => {
  const calls: string[] = [];
  const pane = makePane();
  (pane.view as unknown as { webContents: unknown }).webContents = {
    goBack: () => {
      calls.push("deprecated-goBack");
    },
    goForward: () => {
      calls.push("deprecated-goForward");
    },
    navigationHistory: {
      goBack: () => {
        calls.push("history-goBack");
      },
      goForward: () => {
        calls.push("history-goForward");
      },
    },
  } as never;

  goBackInPane(pane);
  goForwardInPane(pane);

  expect(calls).toEqual(["history-goBack", "history-goForward"]);
});

test("syncPaneNavigationState reads canGoBack/canGoForward from navigationHistory when available", () => {
  const calls: string[] = [];
  const pane = makePane();
  (pane.view as unknown as { webContents: unknown }).webContents = {
    canGoBack: () => {
      calls.push("deprecated-canGoBack");
      return false;
    },
    canGoForward: () => {
      calls.push("deprecated-canGoForward");
      return false;
    },
    navigationHistory: {
      canGoBack: () => {
        calls.push("history-canGoBack");
        return true;
      },
      canGoForward: () => {
        calls.push("history-canGoForward");
        return true;
      },
    },
  } as never;

  syncPaneNavigationState(pane);

  expect(pane.runtimeState.canGoBack).toBe(true);
  expect(pane.runtimeState.canGoForward).toBe(true);
  expect(calls).toEqual(["history-canGoBack", "history-canGoForward"]);
});

test("history helpers record the initial url and later refresh the title for the same visit", () => {
  const pane = makePane();
  const pendingHistoryVisits = new Map();
  const historyCalls: Array<{ url: string; title: string; source: string; visitedAt: number }> = [];
  const historyService = {
    recordVisit: (entry: { url: string; title: string; source: string; visitedAt: number }) => {
      historyCalls.push(entry);
    },
    importEntries: async () => ({ imported: 0, duplicates: 0 }),
    clearAll: async () => {},
  } satisfies NonNullable<BrowserPaneManagerDeps["historyService"]>;

  recordCommittedHistoryVisit(
    pane,
    "https://devspace.example/history",
    pendingHistoryVisits,
    historyService,
  );
  pane.runtimeState.url = "https://devspace.example/history";
  refreshPendingHistoryTitle(pane, "Fresh page title", pendingHistoryVisits, historyService);

  expect(historyCalls.length).toBe(2);
  expect(historyCalls[0]).toMatchObject({
    url: "https://devspace.example/history",
    title: "https://devspace.example/history",
    source: "devspace",
  });
  expect(historyCalls[1]).toMatchObject({
    url: "https://devspace.example/history",
    title: "Fresh page title",
    source: "devspace",
  });
  expect(historyCalls[1]?.visitedAt).toBe(historyCalls[0]?.visitedAt);
});

test("webcontents action helpers call the matching methods when present", async () => {
  const calls: string[] = [];
  const pane = makePane();
  (pane.view as unknown as { webContents: unknown }).webContents = {
    reload: () => {
      calls.push("reload");
    },
    stop: () => {
      calls.push("stop");
    },
    focus: () => {
      calls.push("focus");
    },
    setZoomFactor: async (zoom: number) => {
      calls.push(`zoom:${zoom}`);
    },
  } as never;

  reloadPane(pane);
  stopPane(pane);
  focusPaneWebContents(pane);
  setPaneZoomFactor(pane, 1.5);
  await Promise.resolve();

  expect(calls).toEqual(["reload", "stop", "focus", "zoom:1.5"]);
});

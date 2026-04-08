import { expect, test } from "vitest";

import type { BrowserPaneRecord } from "../browser-types";
import { applyPaneRuntimePatch, reportPaneFailure } from "../browser-pane-runtime-updates";

function makePane(): BrowserPaneRecord {
  return {
    isVisible: false,
    runtimeState: {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
      faviconUrl: "https://example.com/favicon.ico",
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: null,
      failure: null,
    },
    bounds: null,
    view: {
      webContents: {},
    },
  } as unknown as BrowserPaneRecord;
}

test("applyPaneRuntimePatch updates pane runtime state in place", () => {
  const pane = makePane();

  applyPaneRuntimePatch(pane, {
    title: "Updated",
    url: "http://127.0.0.1:3000",
  });

  expect(pane.runtimeState.title).toBe("Updated");
  expect(pane.runtimeState.url).toBe("http://127.0.0.1:3000");
  expect(pane.runtimeState.isSecure).toBe(false);
  expect(pane.runtimeState.securityLabel).toBeNull();
});

test("reportPaneFailure preserves committed url while clearing transient loading state", () => {
  const pane = makePane();

  reportPaneFailure(
    pane,
    {
      kind: "navigation",
      detail: "Certificate error",
      url: "https://expired.badssl.com/",
    },
    {
      title: "Certificate error",
      isSecure: false,
      securityLabel: "Certificate error",
    },
  );

  expect(pane.runtimeState.url).toBe("https://example.com");
  expect(pane.runtimeState.title).toBe("Certificate error");
  expect(pane.runtimeState.faviconUrl).toBeNull();
  expect(pane.runtimeState.isLoading).toBe(false);
  expect(pane.runtimeState.isSecure).toBe(false);
  expect(pane.runtimeState.securityLabel).toBe("Certificate error");
  expect(pane.runtimeState.failure).toEqual({
    kind: "navigation",
    detail: "Certificate error",
    url: "https://expired.badssl.com/",
  });
});

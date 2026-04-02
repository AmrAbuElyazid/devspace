import { test, expect } from "vitest";
import { createBrowserStore } from "./browser-store";

test("updates runtime state by paneId", () => {
  const store = createBrowserStore();
  store.getState().upsertRuntimeState({
    paneId: "pane-1",
    url: "https://a.com",
    title: "A",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });
  expect(store.getState().runtimeByPaneId["pane-1"]?.title).toBe("A");
});

test("clears runtime state by paneId", () => {
  const store = createBrowserStore();
  store.getState().upsertRuntimeState({
    paneId: "pane-1",
    url: "https://a.com",
    title: "A",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });

  store.getState().clearRuntimeState("pane-1");

  expect(store.getState().runtimeByPaneId["pane-1"]).toBe(undefined);
});

test("tracks and clears pending permission requests", () => {
  const store = createBrowserStore();
  const request = {
    paneId: "pane-1",
    origin: "https://a.com",
    permissionType: "camera" as const,
    requestToken: "token-1",
  };

  store.getState().setPendingPermissionRequest(request);
  expect(store.getState().pendingPermissionRequest).toEqual(request);
  expect(store.getState().queuedPermissionRequests).toEqual([]);

  store.getState().clearPendingPermissionRequest();
  expect(store.getState().pendingPermissionRequest).toBe(null);
  expect(store.getState().queuedPermissionRequests).toEqual([]);
});

test("queues later permission requests instead of replacing the current prompt", () => {
  const store = createBrowserStore();
  const firstRequest = {
    paneId: "pane-1",
    origin: "https://a.com",
    permissionType: "camera" as const,
    requestToken: "token-1",
  };
  const secondRequest = {
    paneId: "pane-2",
    origin: "https://b.com",
    permissionType: "microphone" as const,
    requestToken: "token-2",
  };

  store.getState().setPendingPermissionRequest(firstRequest);
  store.getState().setPendingPermissionRequest(secondRequest);

  expect(store.getState().pendingPermissionRequest).toEqual(firstRequest);
  expect(store.getState().queuedPermissionRequests).toEqual([secondRequest]);

  store.getState().clearPendingPermissionRequest();
  expect(store.getState().pendingPermissionRequest).toEqual(secondRequest);
  expect(store.getState().queuedPermissionRequests).toEqual([]);
});

test("clears a pending permission request when its pane runtime is removed", () => {
  const store = createBrowserStore();
  const request = {
    paneId: "pane-1",
    origin: "https://a.com",
    permissionType: "camera" as const,
    requestToken: "token-1",
  };

  store.getState().upsertRuntimeState({
    paneId: "pane-1",
    url: "https://a.com",
    title: "A",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });
  store.getState().setPendingPermissionRequest(request);

  store.getState().clearRuntimeState("pane-1");

  expect(store.getState().pendingPermissionRequest).toBe(null);
});

test("promotes the next queued permission request when the active pane runtime is removed", () => {
  const store = createBrowserStore();
  const firstRequest = {
    paneId: "pane-1",
    origin: "https://a.com",
    permissionType: "camera" as const,
    requestToken: "token-1",
  };
  const secondRequest = {
    paneId: "pane-2",
    origin: "https://b.com",
    permissionType: "microphone" as const,
    requestToken: "token-2",
  };

  store.getState().upsertRuntimeState({
    paneId: "pane-1",
    url: "https://a.com",
    title: "A",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });
  store.getState().upsertRuntimeState({
    paneId: "pane-2",
    url: "https://b.com",
    title: "B",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  });

  store.getState().setPendingPermissionRequest(firstRequest);
  store.getState().setPendingPermissionRequest(secondRequest);

  store.getState().clearRuntimeState("pane-1");

  expect(store.getState().pendingPermissionRequest).toEqual(secondRequest);
  expect(store.getState().queuedPermissionRequests).toEqual([]);
});

test("handles runtime state changes and only persists changed urls", () => {
  const store = createBrowserStore();
  const persisted: Array<{ paneId: string; url: string }> = [];
  const runtimeState = {
    paneId: "pane-1",
    url: "https://a.com",
    title: "A",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isSecure: true,
    securityLabel: "Secure",
    currentZoom: 1,
    find: null,
    failure: null,
  } as const;

  store.getState().handleRuntimeStateChange(runtimeState, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url });
    },
    persistCommittedNavigation: true,
  });
  store.getState().handleRuntimeStateChange(runtimeState, {
    persistUrlChange: (paneId, url) => {
      persisted.push({ paneId, url });
    },
    persistCommittedNavigation: true,
  });

  expect(persisted).toEqual([{ paneId: "pane-1", url: "https://a.com" }]);
  expect(store.getState().runtimeByPaneId["pane-1"]?.title).toBe("A");
});

test("does not persist uncommitted navigation targets", () => {
  const store = createBrowserStore();
  const persisted: Array<{ paneId: string; url: string }> = [];

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://committed.example",
      title: "Committed",
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
    {
      persistUrlChange: (paneId, url) => {
        persisted.push({ paneId, url });
      },
      persistCommittedNavigation: true,
    },
  );

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://typed-but-uncommitted.example",
      title: "Committed",
      faviconUrl: null,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: null,
      failure: null,
    },
    {
      persistUrlChange: (paneId, url) => {
        persisted.push({ paneId, url });
      },
      persistCommittedNavigation: false,
    },
  );

  expect(persisted).toEqual([{ paneId: "pane-1", url: "https://committed.example" }]);
  expect(store.getState().runtimeByPaneId["pane-1"]?.url).toBe(
    "https://typed-but-uncommitted.example",
  );
});

test("persists zoom changes independently from url persistence", () => {
  const store = createBrowserStore();
  const persistedUrls: Array<{ paneId: string; url: string }> = [];
  const persistedZooms: Array<{ paneId: string; zoom: number }> = [];

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
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
    {
      persistUrlChange: (paneId, url) => {
        persistedUrls.push({ paneId, url });
      },
      persistCommittedNavigation: true,
      persistZoomChange: (paneId, zoom) => {
        persistedZooms.push({ paneId, zoom });
      },
    },
  );

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1.25,
      find: null,
      failure: null,
    },
    {
      persistUrlChange: (paneId, url) => {
        persistedUrls.push({ paneId, url });
      },
      persistCommittedNavigation: true,
      persistZoomChange: (paneId, zoom) => {
        persistedZooms.push({ paneId, zoom });
      },
    },
  );

  expect(persistedUrls).toEqual([{ paneId: "pane-1", url: "https://example.com" }]);
  expect(persistedZooms).toEqual([{ paneId: "pane-1", zoom: 1.25 }]);
});

test("does not persist initial runtime zoom before a user-driven zoom change", () => {
  const store = createBrowserStore();
  const persistedZooms: Array<{ paneId: string; zoom: number }> = [];

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
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
    {
      persistUrlChange: () => {},
      persistCommittedNavigation: true,
      persistZoomChange: (paneId, zoom) => {
        persistedZooms.push({ paneId, zoom });
      },
    },
  );

  store.getState().handleRuntimeStateChange(
    {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1.25,
      find: null,
      failure: null,
    },
    {
      persistUrlChange: () => {},
      persistCommittedNavigation: true,
      persistZoomChange: (paneId, zoom) => {
        persistedZooms.push({ paneId, zoom });
      },
    },
  );

  expect(persistedZooms).toEqual([{ paneId: "pane-1", zoom: 1.25 }]);
});

test("find bar focus and visibility are tracked per pane", () => {
  const store = createBrowserStore();

  store.getState().requestFindBarFocus("pane-1");
  expect(store.getState().findBarOpenByPaneId["pane-1"]).toBe(true);
  expect(store.getState().findBarFocusTokenByPaneId["pane-1"]).toBe(1);

  store.getState().requestFindBarFocus("pane-1");
  expect(store.getState().findBarFocusTokenByPaneId["pane-1"]).toBe(2);

  store.getState().closeFindBar("pane-1");
  expect(store.getState().findBarOpenByPaneId["pane-1"]).toBe(false);

  store.getState().requestAddressBarFocus("pane-1");
  expect(store.getState().addressBarFocusTokenByPaneId["pane-1"]).toBe(1);
});

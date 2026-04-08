import { expect, test, vi } from "vitest";

import { createBrowserPanePermissionTracker } from "../browser-pane-permissions";

test("permission tracker requests, resolves, and emits through the renderer", () => {
  const sendToRenderer = vi.fn();
  const decisions: string[] = [];
  const tracker = createBrowserPanePermissionTracker(sendToRenderer);

  tracker.request(
    {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
    (decision) => {
      decisions.push(decision);
    },
  );
  tracker.resolve("token-1", "allow-for-session");

  expect(decisions).toEqual(["allow-for-session"]);
  expect(sendToRenderer).toHaveBeenCalledWith("browser:permissionRequested", {
    paneId: "pane-1",
    origin: "https://camera.example",
    permissionType: "camera",
    requestToken: "token-1",
  });
});

test("permission tracker denies pending requests when their pane is destroyed", () => {
  const decisions: string[] = [];
  const tracker = createBrowserPanePermissionTracker(() => {});

  tracker.request(
    {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
    (decision) => {
      decisions.push(`pane-1:${decision}`);
    },
  );
  tracker.request(
    {
      paneId: "pane-2",
      origin: "https://microphone.example",
      permissionType: "microphone",
      requestToken: "token-2",
    },
    (decision) => {
      decisions.push(`pane-2:${decision}`);
    },
  );

  tracker.denyPendingForPane("pane-1");

  expect(decisions).toEqual(["pane-1:deny"]);
});

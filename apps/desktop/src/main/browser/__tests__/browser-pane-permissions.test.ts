import { expect, test } from "vitest";
import {
  denyPendingPermissionsForPane,
  requestBrowserPermission,
  resolveBrowserPermission,
} from "../browser-pane-permissions";
import type { PendingPermissionRequest } from "../browser-pane-permissions";

test("requestBrowserPermission stores the pending request and emits it to the renderer", () => {
  const pending = new Map<string, PendingPermissionRequest>();
  const messages: Array<{ channel: string; payload: unknown }> = [];

  requestBrowserPermission(
    pending,
    {
      paneId: "pane-1",
      origin: "https://camera.example",
      permissionType: "camera",
      requestToken: "token-1",
    },
    () => {},
    (channel, payload) => {
      messages.push({ channel, payload });
    },
  );

  expect(pending.has("token-1")).toBe(true);
  expect(messages).toEqual([
    {
      channel: "browser:permissionRequested",
      payload: {
        paneId: "pane-1",
        origin: "https://camera.example",
        permissionType: "camera",
        requestToken: "token-1",
      },
    },
  ]);
});

test("resolveBrowserPermission resolves and clears the matching pending request", () => {
  const decisions: string[] = [];
  const pending = new Map<string, PendingPermissionRequest>([
    [
      "token-1",
      {
        paneId: "pane-1",
        resolve: (decision) => {
          decisions.push(decision);
        },
      },
    ],
  ]);

  resolveBrowserPermission(pending, "token-1", "allow-for-session");

  expect(decisions).toEqual(["allow-for-session"]);
  expect(pending.size).toBe(0);
});

test("denyPendingPermissionsForPane only denies requests belonging to the destroyed pane", () => {
  const decisions: string[] = [];
  const pending = new Map<string, PendingPermissionRequest>([
    [
      "token-1",
      {
        paneId: "pane-1",
        resolve: (decision) => {
          decisions.push(`pane-1:${decision}`);
        },
      },
    ],
    [
      "token-2",
      {
        paneId: "pane-2",
        resolve: (decision) => {
          decisions.push(`pane-2:${decision}`);
        },
      },
    ],
  ]);

  denyPendingPermissionsForPane(pending, "pane-1");

  expect(decisions).toEqual(["pane-1:deny"]);
  expect([...pending.keys()]).toEqual(["token-2"]);
});

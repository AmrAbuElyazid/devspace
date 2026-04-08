import type { BrowserPermissionDecision, BrowserPermissionRequest } from "../../shared/browser";
import type { BrowserPaneManagerDeps } from "./browser-types";

type PendingPermissionResolution = (decision: BrowserPermissionDecision) => void;

export type PendingPermissionRequest = {
  paneId: string;
  resolve: PendingPermissionResolution;
};

export interface BrowserPanePermissionTracker {
  denyPendingForPane: (paneId: string) => void;
  request: (request: BrowserPermissionRequest, resolve: PendingPermissionResolution) => void;
  resolve: (requestToken: string, decision: BrowserPermissionDecision) => void;
}

export function requestBrowserPermission(
  pendingPermissionResolutions: Map<string, PendingPermissionRequest>,
  request: BrowserPermissionRequest,
  resolve: PendingPermissionResolution,
  sendToRenderer: (channel: string, ...args: unknown[]) => void,
): void {
  pendingPermissionResolutions.set(request.requestToken, {
    paneId: request.paneId,
    resolve,
  });
  sendToRenderer("browser:permissionRequested", request);
}

export function resolveBrowserPermission(
  pendingPermissionResolutions: Map<string, PendingPermissionRequest>,
  requestToken: string,
  decision: BrowserPermissionDecision,
): void {
  const pendingRequest = pendingPermissionResolutions.get(requestToken);
  if (!pendingRequest) {
    return;
  }

  pendingPermissionResolutions.delete(requestToken);
  pendingRequest.resolve(decision);
}

export function denyPendingPermissionsForPane(
  pendingPermissionResolutions: Map<string, PendingPermissionRequest>,
  paneId: string,
): void {
  for (const [requestToken, pendingRequest] of pendingPermissionResolutions.entries()) {
    if (pendingRequest.paneId !== paneId) {
      continue;
    }

    pendingPermissionResolutions.delete(requestToken);
    pendingRequest.resolve("deny");
  }
}

export function createBrowserPanePermissionTracker(
  sendToRenderer: BrowserPaneManagerDeps["sendToRenderer"],
): BrowserPanePermissionTracker {
  const pendingPermissionResolutions = new Map<string, PendingPermissionRequest>();

  return {
    denyPendingForPane(paneId) {
      denyPendingPermissionsForPane(pendingPermissionResolutions, paneId);
    },
    request(request, resolve) {
      requestBrowserPermission(pendingPermissionResolutions, request, resolve, sendToRenderer);
    },
    resolve(requestToken, decision) {
      resolveBrowserPermission(pendingPermissionResolutions, requestToken, decision);
    },
  };
}

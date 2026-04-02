import type { BrowserPermissionDecision, BrowserPermissionRequest } from "../../shared/browser";

type PendingPermissionResolution = (decision: BrowserPermissionDecision) => void;

export type PendingPermissionRequest = {
  paneId: string;
  resolve: PendingPermissionResolution;
};

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

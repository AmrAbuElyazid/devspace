import type { ReactElement } from "react";
import type { BrowserPermissionDecision, BrowserPermissionRequest } from "../../../shared/browser";
import { Button } from "../ui/button";

interface BrowserPermissionPromptProps {
  request: BrowserPermissionRequest;
  onDecision: (decision: BrowserPermissionDecision) => void;
  onDismiss: () => void;
}

function humanizePermissionType(
  permissionType: BrowserPermissionRequest["permissionType"],
): string {
  return permissionType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPermissionLabel(permissionType: BrowserPermissionRequest["permissionType"]): string {
  switch (permissionType) {
    case "camera":
      return "Camera";
    case "microphone":
      return "Microphone";
    case "media":
      return "Media Devices";
    case "geolocation":
      return "Location";
    case "notifications":
      return "Notifications";
    case "clipboard-read":
      return "Clipboard Read";
    case "clipboard-sanitized-write":
      return "Clipboard Write";
    case "openExternal":
      return "Open External Links";
    case "pointerLock":
      return "Pointer Lock";
    case "storage-access":
      return "Storage Access";
    case "top-level-storage-access":
      return "Top-Level Storage Access";
    case "fileSystem":
      return "File System";
    default:
      return humanizePermissionType(permissionType);
  }
}

function formatPermissionDescription(
  permissionType: BrowserPermissionRequest["permissionType"],
  permissionLabel: string,
): string {
  switch (permissionType) {
    case "camera":
      return "wants access to your camera.";
    case "microphone":
      return "wants access to your microphone.";
    case "media":
      return "wants access to your media devices.";
    case "geolocation":
      return "wants access to your location.";
    case "notifications":
      return "wants to show notifications.";
    default:
      return `is requesting ${permissionLabel.toLowerCase()} permission.`;
  }
}

export default function BrowserPermissionPrompt({
  request,
  onDecision,
  onDismiss,
}: BrowserPermissionPromptProps): ReactElement {
  const permissionLabel = formatPermissionLabel(request.permissionType);
  const originLabel = request.origin;
  const permissionDescription = formatPermissionDescription(
    request.permissionType,
    permissionLabel,
  );

  return (
    <div
      className="browser-permission-prompt"
      role="dialog"
      aria-label={`${permissionLabel} permission request`}
    >
      <div className="browser-permission-eyebrow">Permission request</div>
      <h2>{permissionLabel}</h2>
      <p>
        <strong>{originLabel}</strong> {permissionDescription}
      </p>
      <div className="browser-permission-actions">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDecision("deny")}>
          Deny
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onDecision("allow-once")}>
          Allow once
        </Button>
        <Button size="sm" onClick={() => onDecision("allow-for-session")}>
          Allow for session
        </Button>
      </div>
    </div>
  );
}

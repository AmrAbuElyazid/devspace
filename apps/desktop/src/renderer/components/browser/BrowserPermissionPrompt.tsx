import type { ReactElement } from "react";

import type { BrowserPermissionDecision, BrowserPermissionRequest } from "../../../shared/browser";
import { Button } from "@/components/ui/button";

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
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatPermissionLabel(t: BrowserPermissionRequest["permissionType"]): string {
  switch (t) {
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
      return humanizePermissionType(t);
  }
}

function formatPermissionDescription(
  t: BrowserPermissionRequest["permissionType"],
  label: string,
): string {
  switch (t) {
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
      return `is requesting ${label.toLowerCase()} permission.`;
  }
}

export default function BrowserPermissionPrompt({
  request,
  onDecision,
  onDismiss,
}: BrowserPermissionPromptProps): ReactElement {
  const label = formatPermissionLabel(request.permissionType);
  const description = formatPermissionDescription(request.permissionType, label);

  return (
    <div
      role="dialog"
      aria-label={`${label} permission request`}
      className="flex flex-wrap items-center gap-3 shrink-0 px-4 py-2.5 bg-rail border-b border-hairline"
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-brand">
          Permission request
        </span>
        <div className="text-[12px] text-foreground mt-0.5">
          <span className="font-medium">{request.origin}</span>{" "}
          <span className="text-muted-foreground">{description}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button variant="outline" size="xs" onClick={() => onDecision("deny")}>
          Deny
        </Button>
        <Button variant="secondary" size="xs" onClick={() => onDecision("allow-once")}>
          Allow once
        </Button>
        <Button variant="default" size="xs" onClick={() => onDecision("allow-for-session")}>
          Allow for session
        </Button>
      </div>
    </div>
  );
}

import type { ReactElement } from "react";
import type { BrowserPermissionDecision, BrowserPermissionRequest } from "../../../shared/browser";
import { Button } from "../ui/button";

interface BrowserPermissionPromptProps {
  request: BrowserPermissionRequest;
  onDecision: (decision: BrowserPermissionDecision) => void;
  onDismiss: () => void;
}

function formatPermissionLabel(permissionType: BrowserPermissionRequest["permissionType"]): string {
  switch (permissionType) {
    case "camera":
      return "Camera";
    case "microphone":
      return "Microphone";
    case "geolocation":
      return "Location";
    case "notifications":
      return "Notifications";
  }
}

export default function BrowserPermissionPrompt({
  request,
  onDecision,
  onDismiss,
}: BrowserPermissionPromptProps): ReactElement {
  const permissionLabel = formatPermissionLabel(request.permissionType);
  const originLabel = request.origin;

  return (
    <div
      className="browser-permission-prompt"
      role="dialog"
      aria-label={`${permissionLabel} permission request`}
    >
      <div className="browser-permission-eyebrow">Permission request</div>
      <h2>{permissionLabel}</h2>
      <p>
        <strong>{originLabel}</strong> wants access to your {permissionLabel.toLowerCase()}.
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

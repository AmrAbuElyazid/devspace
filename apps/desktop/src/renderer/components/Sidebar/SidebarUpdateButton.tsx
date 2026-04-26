import { Download, RotateCw } from "lucide-react";
import type { AppUpdateState } from "../../../shared/types";
import { useAppUpdateState } from "../../hooks/useAppUpdateState";
import { useToastStore } from "../../hooks/useToast";
import { Tooltip } from "../ui/tooltip";

type SidebarUpdateAction = "install" | "retry" | "none";

function resolveSidebarUpdateAction(state: AppUpdateState): SidebarUpdateAction {
  if (state.status === "downloaded") {
    return "install";
  }
  if (state.status === "available" && state.message) {
    return "retry";
  }
  return "none";
}

function shouldShowSidebarUpdateButton(state: AppUpdateState | null): boolean {
  if (!state?.enabled) {
    return false;
  }
  return (
    state.status === "available" || state.status === "downloading" || state.status === "downloaded"
  );
}

function getSidebarUpdateLabel(state: AppUpdateState): string {
  if (state.status === "downloaded") {
    return "Restart to Update";
  }
  if (state.status === "available" && state.message) {
    return "Retry Update";
  }
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading ${Math.floor(state.downloadPercent)}%`
      : "Downloading Update";
  }
  return "Downloading Update";
}

function getSidebarUpdateTooltip(state: AppUpdateState): string {
  if (state.status === "downloaded") {
    return `Update ${state.availableVersion ?? "ready"} downloaded. Click to restart and install.`;
  }
  if (state.status === "available" && state.message) {
    return `${state.message} Click to retry.`;
  }
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading update (${Math.floor(state.downloadPercent)}%).`
      : `Downloading update ${state.availableVersion ?? ""}...`.trim();
  }
  return `Update ${state.availableVersion ?? "available"} found. Downloading in the background.`;
}

function isSidebarUpdateButtonDisabled(state: AppUpdateState): boolean {
  return resolveSidebarUpdateAction(state) === "none";
}

function getSidebarUpdateTone(state: AppUpdateState): "primary" | "error" {
  return state.status === "available" && state.message ? "error" : "primary";
}

export function SidebarUpdateButton() {
  const state = useAppUpdateState();
  const addToast = useToastStore((store) => store.addToast);

  if (!state || !shouldShowSidebarUpdateButton(state)) {
    return null;
  }

  const action = resolveSidebarUpdateAction(state);
  const disabled = isSidebarUpdateButtonDisabled(state);
  const tone = getSidebarUpdateTone(state);

  const handleClick = async () => {
    if (disabled) {
      return;
    }

    if (action === "install") {
      const accepted = await window.api.app.installUpdate();
      if (!accepted) {
        const nextState = await window.api.app.getUpdateState();
        addToast(nextState.message ?? "Could not install the update.", "error");
      }
      return;
    }

    if (action === "retry") {
      const started = await window.api.app.checkForUpdates();
      if (!started) {
        const nextState = await window.api.app.getUpdateState();
        addToast(nextState.message ?? "Could not retry the update.", "error");
      }
    }
  };

  return (
    <Tooltip content={getSidebarUpdateTooltip(state)} side="top">
      <button
        type="button"
        className="sidebar-update-button no-drag"
        data-tone={tone}
        data-disabled={disabled ? "true" : undefined}
        onClick={() => {
          void handleClick();
        }}
        disabled={disabled}
        aria-label={getSidebarUpdateTooltip(state)}
      >
        {action === "install" ? <RotateCw size={13} strokeWidth={1.8} /> : <Download size={13} />}
        <span>{getSidebarUpdateLabel(state)}</span>
      </button>
    </Tooltip>
  );
}

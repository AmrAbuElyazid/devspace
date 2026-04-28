import { Download, RotateCw } from "lucide-react";

import type { AppUpdateState } from "../../../shared/types";
import { useAppUpdateState } from "@/hooks/useAppUpdateState";
import { addToast } from "@/hooks/useToast";

import { HintTooltip } from "@/components/ui/hint-tooltip";
import { cn } from "@/lib/utils";

type SidebarUpdateAction = "install" | "retry" | "none";

function resolveSidebarUpdateAction(state: AppUpdateState): SidebarUpdateAction {
  if (state.status === "downloaded") return "install";
  if (state.status === "available" && state.message) return "retry";
  return "none";
}

function shouldShowSidebarUpdateButton(state: AppUpdateState | null): boolean {
  if (!state?.enabled) return false;
  return (
    state.status === "available" || state.status === "downloading" || state.status === "downloaded"
  );
}

function getSidebarUpdateLabel(state: AppUpdateState): string {
  if (state.status === "downloaded") return "Restart to update";
  if (state.status === "available" && state.message) return "Retry update";
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading ${Math.floor(state.downloadPercent)}%`
      : "Downloading update";
  }
  return "Downloading update";
}

function getSidebarUpdateTooltip(state: AppUpdateState): string {
  if (state.status === "downloaded") {
    return `Update ${state.availableVersion ?? "ready"} downloaded. Click to restart and install.`;
  }
  if (state.status === "available" && state.message) return `${state.message} Click to retry.`;
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading update (${Math.floor(state.downloadPercent)}%).`
      : `Downloading update ${state.availableVersion ?? ""}...`.trim();
  }
  return `Update ${state.availableVersion ?? "available"} found. Downloading in the background.`;
}

export function SidebarUpdateButton() {
  const state = useAppUpdateState();
  if (!state || !shouldShowSidebarUpdateButton(state)) return null;

  const action = resolveSidebarUpdateAction(state);
  const disabled = action === "none";
  const isError = state.status === "available" && !!state.message;

  const handleClick = async () => {
    if (disabled) return;
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
    <HintTooltip content={getSidebarUpdateTooltip(state)} side="top">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled}
        aria-label={getSidebarUpdateTooltip(state)}
        className={cn(
          "no-drag w-full flex items-center gap-2 h-8 px-2 rounded-md",
          "text-[12px] font-medium border transition-colors",
          isError
            ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15"
            : "bg-brand-soft text-foreground border-brand-edge hover:bg-brand-soft/80",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {action === "install" ? (
          <RotateCw size={12} strokeWidth={1.8} className={cn(isError ? "" : "text-brand")} />
        ) : (
          <Download size={12} className={cn(isError ? "" : "text-brand")} />
        )}
        <span className="truncate text-left flex-1">{getSidebarUpdateLabel(state)}</span>
      </button>
    </HintTooltip>
  );
}

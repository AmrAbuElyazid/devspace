import type { BrowserFailureState } from "../../shared/browser";
import type { BrowserPaneRecord, BrowserRuntimePatch } from "./browser-types";
import { applyRuntimeStatePatch } from "./browser-runtime-state";

export function applyPaneRuntimePatch(pane: BrowserPaneRecord, patch: BrowserRuntimePatch): void {
  applyRuntimeStatePatch(pane.runtimeState, patch);
}

export function reportPaneFailure(
  pane: BrowserPaneRecord,
  failure: BrowserFailureState,
  options?: { title?: string; isSecure?: boolean; securityLabel?: string | null },
): void {
  applyPaneRuntimePatch(pane, {
    title: options?.title ?? pane.runtimeState.title,
    faviconUrl: null,
    isLoading: false,
    ...(options?.isSecure !== undefined ? { isSecure: options.isSecure } : {}),
    ...(options?.securityLabel !== undefined ? { securityLabel: options.securityLabel } : {}),
    failure,
  });
}

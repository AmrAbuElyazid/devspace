import type { BrowserFindState, BrowserRuntimeState } from "../../shared/browser";
import type { BrowserRuntimePatch } from "./browser-types";

function cloneFindState(find: BrowserFindState | null): BrowserFindState | null {
  if (!find) {
    return null;
  }

  return { ...find };
}

function getSecurityState(url: string): Pick<BrowserRuntimeState, "isSecure" | "securityLabel"> {
  const isSecure = url.startsWith("https://");
  return {
    isSecure,
    securityLabel: isSecure ? "Secure" : null,
  };
}

export function createInitialRuntimeState(paneId: string, initialUrl: string): BrowserRuntimeState {
  return {
    paneId,
    url: initialUrl,
    title: "Browser",
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    ...getSecurityState(initialUrl),
    currentZoom: 1,
    find: null,
    failure: null,
  };
}

export function cloneRuntimeState(state: BrowserRuntimeState): BrowserRuntimeState {
  return {
    ...state,
    find: cloneFindState(state.find),
  };
}

export function withDerivedSecurityState(
  url: string,
): Pick<BrowserRuntimeState, "isSecure" | "securityLabel"> {
  return getSecurityState(url);
}

export function markRuntimeStateNavigating(state: BrowserRuntimeState): void {
  state.isLoading = true;
  state.failure = null;
}

export function setRuntimeStateZoom(state: BrowserRuntimeState, zoom: number): void {
  state.currentZoom = zoom;
}

export function setRuntimeStateFindQuery(state: BrowserRuntimeState, query: string): void {
  state.find = {
    query,
    activeMatch: 0,
    totalMatches: 0,
  };
}

export function applyRuntimeStateFindResult(
  state: BrowserRuntimeState,
  result: BrowserFindState,
): void {
  state.find = {
    query: result.query,
    activeMatch: result.activeMatch,
    totalMatches: result.totalMatches,
  };
}

export function clearRuntimeStateFind(state: BrowserRuntimeState): void {
  state.find = null;
}

export function applyRuntimeStatePatch(
  state: BrowserRuntimeState,
  patch: BrowserRuntimePatch,
): void {
  Object.assign(state, patch);

  const hasExplicitSecurityState =
    patch.isSecure !== undefined || patch.securityLabel !== undefined;
  if (patch.url !== undefined && !hasExplicitSecurityState) {
    Object.assign(state, withDerivedSecurityState(patch.url));
  }
}

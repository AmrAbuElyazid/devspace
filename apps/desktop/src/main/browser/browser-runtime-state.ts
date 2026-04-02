import type { BrowserFindState, BrowserRuntimeState } from "../../shared/browser";

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

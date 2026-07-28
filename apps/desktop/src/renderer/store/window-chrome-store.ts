import { create } from "zustand";

import { titleBarHeightFor, TRAFFIC_LIGHT_GUTTER } from "../../shared/chrome";
import { useSettingsStore } from "./settings-store";

/**
 * Native window chrome the renderer has to lay out around.
 *
 * macOS draws the traffic lights itself, so every bar that can end up in the
 * top-left has to leave a matching gutter — and the buttons have to be nudged
 * to the vertical center of whichever bar that is. Both facts used to be
 * rediscovered by each component with its own `isFullScreen()` round-trip and
 * its own hardcoded padding; they live here once instead.
 */
interface WindowChromeState {
  isFullScreen: boolean;
  /** Left padding a top-left bar must reserve for the native window buttons. */
  trafficLightGutter: number;
}

export const useWindowChromeStore = create<WindowChromeState>(() => ({
  isFullScreen: false,
  trafficLightGutter: TRAFFIC_LIGHT_GUTTER,
}));

/** True while macOS is drawing the traffic lights (i.e. not fullscreen). */
export function useTrafficLightGutter(): number {
  return useWindowChromeStore((s) => (s.isFullScreen ? 0 : s.trafficLightGutter));
}

function setFullScreen(isFullScreen: boolean): void {
  useWindowChromeStore.setState({ isFullScreen });
}

let initialized = false;

/**
 * Wires the store to the main process: mirrors the native fullscreen flag and
 * pushes the title-bar height back so the buttons stay centered. Idempotent —
 * module-level callers may invoke it more than once under HMR.
 *
 * A no-op without a DOM: the server-rendered component tests import App for
 * its context, and there is no window chrome to talk to there.
 */
export function initWindowChromeSubscriptions(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  void window.api?.window?.isFullScreen().then(setFullScreen);
  window.api?.window?.onFullScreenChange(setFullScreen);

  const pushTitleBarHeight = (sidebarOpen: boolean): void => {
    window.api?.window?.setTitleBarHeight(titleBarHeightFor(sidebarOpen));
  };

  pushTitleBarHeight(useSettingsStore.getState().sidebarOpen);
  useSettingsStore.subscribe((state, prev) => {
    if (state.sidebarOpen !== prev.sidebarOpen) pushTitleBarHeight(state.sidebarOpen);
  });
}

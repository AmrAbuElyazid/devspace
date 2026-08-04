import React from "react";
import ReactDOM from "react-dom/client";
import "allotment/dist/style.css";
import "./styles/globals.css";
import {
  initializeWorkspaceStore,
  resetWorkspaceStoreToDefaults,
  useWorkspaceStore,
} from "./store/workspace-store";
import {
  getNativeViewProfilingSnapshot,
  resetNativeViewProfilingCounters,
} from "./store/native-view-store";
import { getTerminalSurfaceSessionSnapshot } from "./lib/terminal-surface-session";

function renderFatalBootstrapError(message: string): void {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <div className="h-screen w-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-base font-medium">Devspace failed to start</div>
          <div className="mt-2 text-sm opacity-80">{message}</div>
        </div>
      </div>
    </React.StrictMode>,
  );
}

/**
 * The overlay view loads this same entry with `#overlay`, and stops here.
 *
 * Sharing the bundle means the menus it draws share the app's design tokens and
 * glass surfaces for free. Because `App` is behind a dynamic import below, this
 * branch never pulls the workspace store, the native-view manager or any pane
 * code into the overlay's renderer — it stays a near-empty process.
 */
async function bootstrapOverlay(): Promise<void> {
  document.documentElement.classList.add("overlay-root");
  const { default: OverlayRoot } = await import("./overlay/OverlayRoot");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <OverlayRoot />
    </React.StrictMode>,
  );
}

async function bootstrap(): Promise<void> {
  if (window.location.hash.startsWith("#overlay")) {
    await bootstrapOverlay();
    return;
  }

  try {
    await initializeWorkspaceStore();
  } catch (error) {
    console.error("[bootstrap] Workspace initialization failed, starting fresh:", error);
    resetWorkspaceStoreToDefaults();
  }

  try {
    const { default: App } = await import("./App");

    // Expose store for E2E testing and debugging (Playwright page.evaluate access).
    // This is safe — Devspace is a desktop app, not a web app.
    (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ = useWorkspaceStore;
    (window as unknown as Record<string, unknown>).__DEVSPACE_NATIVE_VIEWS__ = {
      getSnapshot: getNativeViewProfilingSnapshot,
      resetCounters: resetNativeViewProfilingCounters,
    };
    (window as unknown as Record<string, unknown>).__DEVSPACE_PERF__ = {
      getSnapshot: async () => ({
        main: await window.api.app.getPerformanceSnapshot(),
        nativeViews: getNativeViewProfilingSnapshot(),
        terminalSurfaces: getTerminalSurfaceSessionSnapshot(),
      }),
      resetCounters: async () => {
        resetNativeViewProfilingCounters();
        await window.api.app.resetPerformanceCounters();
      },
    };

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("[bootstrap] Renderer bootstrap failed:", error);
    renderFatalBootstrapError(error instanceof Error ? error.message : String(error));
  }
}

void bootstrap();

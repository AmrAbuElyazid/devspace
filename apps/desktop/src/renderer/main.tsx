import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import "./styles/workspace-shell.css";
import "./styles/browser-pane.css";
import "./styles/ui-primitives.css";
import {
  initializeWorkspaceStore,
  resetWorkspaceStoreToDefaults,
  useWorkspaceStore,
} from "./store/workspace-store";
import {
  getNativeViewProfilingSnapshot,
  resetNativeViewProfilingCounters,
} from "./store/native-view-store";

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

async function bootstrap(): Promise<void> {
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

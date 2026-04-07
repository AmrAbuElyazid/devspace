import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { useWorkspaceStore } from "./store/workspace-store";
import {
  getNativeViewProfilingSnapshot,
  resetNativeViewProfilingCounters,
} from "./store/native-view-store";

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

import type { BrowserPaneKind, BrowserPaneRecord } from "./browser-types";
import { createInitialRuntimeState } from "./browser-runtime-state";

type BrowserViewFactory = (
  options: Electron.WebContentsViewConstructorOptions,
) => Electron.WebContentsView;

export function createElectronView(
  options: Electron.WebContentsViewConstructorOptions,
): Electron.WebContentsView {
  const { WebContentsView } = require("electron") as typeof import("electron");
  return new WebContentsView(options);
}

function createBrowserViewOptions(
  session?: Electron.Session,
): Electron.WebContentsViewConstructorOptions {
  return {
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      safeDialogs: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      ...(session ? { session } : {}),
    },
  };
}

export function createBrowserPaneRecord({
  createView,
  initialUrl,
  kind,
  paneId,
  session,
}: {
  createView: BrowserViewFactory;
  initialUrl: string;
  kind: BrowserPaneKind;
  paneId: string;
  session?: Electron.Session;
}): BrowserPaneRecord {
  return {
    view: createView(createBrowserViewOptions(session)),
    kind,
    runtimeState: createInitialRuntimeState(paneId, initialUrl),
    bounds: null,
    isVisible: false,
  };
}

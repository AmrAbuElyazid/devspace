import { vi } from "vitest";
import type { DevspaceBridge } from "../../shared/types";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const unsubscribe = () => {};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const [key, overrideValue] of Object.entries(overrides as Record<string, unknown>)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = mergeDeep(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue;
    }
  }

  return result as T;
}

function createDefaultWindowApi(): DevspaceBridge {
  return {
    platform: "darwin",
    app: {
      onAction: vi.fn(() => unsubscribe),
      getPerformanceSnapshot: vi.fn(async () => ({
        sampledAt: Date.now(),
        process: {
          memory: {
            rss: 1,
            heapTotal: 1,
            heapUsed: 1,
            external: 0,
            arrayBuffers: 0,
          },
          cpu: {
            user: 0,
            system: 0,
          },
        },
        appMetrics: [],
        operations: {},
      })),
      resetPerformanceCounters: vi.fn(async () => {}),
      getUpdateState: vi.fn(async () => ({
        enabled: false,
        status: "disabled" as const,
        currentVersion: "0.1.0",
        availableVersion: null,
        checkedAt: null,
        downloadPercent: null,
        message: null,
        disabledReason: "Automatic updates are only available in packaged production builds.",
      })),
      checkForUpdates: vi.fn(async () => false),
      installUpdate: vi.fn(async () => false),
      onUpdateStateChanged: vi.fn(() => unsubscribe),
    },
    terminal: {
      create: vi.fn(async () => ({ ok: true as const })),
      destroy: vi.fn(async () => {}),
      show: vi.fn(async () => {}),
      hide: vi.fn(async () => {}),
      focus: vi.fn(),
      setBounds: vi.fn(),
      setVisibleSurfaces: vi.fn(),
      sendBindingAction: vi.fn(async () => true),
      blur: vi.fn(),
      onTitleChanged: vi.fn(() => unsubscribe),
      onClosed: vi.fn(() => unsubscribe),
      onFocused: vi.fn(() => unsubscribe),
      onPwdChanged: vi.fn(() => unsubscribe),
      onSearchStart: vi.fn(() => unsubscribe),
      onSearchEnd: vi.fn(() => unsubscribe),
      onSearchTotal: vi.fn(() => unsubscribe),
      onSearchSelected: vi.fn(() => unsubscribe),
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      focusContent: vi.fn(),
      setSidebarOpen: vi.fn(),
      setThemeMode: vi.fn(),
      isMaximized: vi.fn(async () => false),
      isFullScreen: vi.fn(async () => false),
      onMaximizeChange: vi.fn(() => unsubscribe),
      onFullScreenChange: vi.fn(() => unsubscribe),
      onFocus: vi.fn(() => unsubscribe),
      onNativeModifierChanged: vi.fn(() => unsubscribe),
      onOpenEditor: vi.fn(() => unsubscribe),
    },
    dialog: {
      openFile: vi.fn(async () => null),
      openFolder: vi.fn(async () => null),
    },
    notes: {
      read: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      saveSync: vi.fn(() => {}),
      list: vi.fn(async () => []),
    },
    shell: {
      openExternal: vi.fn(),
    },
    contextMenu: {
      show: vi.fn(async () => null) as DevspaceBridge["contextMenu"]["show"],
    },
    editor: {
      isAvailable: vi.fn(async () => false),
      getCliStatus: vi.fn(async () => ({ path: null, reason: "not-found" as const })),
      start: vi.fn(async () => ({ error: "Unavailable" })),
      stop: vi.fn(async () => {}),
      setKeepServerRunning: vi.fn(),
    },
    shortcuts: {
      getAll: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
      resetAll: vi.fn(async () => {}),
      onChanged: vi.fn(() => unsubscribe),
    },
    cli: {
      install: vi.fn(async () => ({ ok: true })),
    },
    workspaceState: {
      load: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      saveSync: vi.fn(),
    },
    t3code: {
      isAvailable: vi.fn(async () => false),
      start: vi.fn(async () => ({ error: "Unavailable" })),
      stop: vi.fn(async () => {}),
    },
    browser: {
      create: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
      show: vi.fn(async () => {}),
      hide: vi.fn(async () => {}),
      setVisiblePanes: vi.fn(),
      getRuntimeState: vi.fn(async () => undefined),
      navigate: vi.fn(async () => {}),
      back: vi.fn(async () => {}),
      forward: vi.fn(async () => {}),
      reload: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      setBounds: vi.fn(),
      setFocus: vi.fn(),
      setZoom: vi.fn(async () => {}),
      resetZoom: vi.fn(async () => {}),
      findInPage: vi.fn(async () => {}),
      stopFindInPage: vi.fn(async () => {}),
      toggleDevTools: vi.fn(async () => {}),
      showContextMenu: vi.fn(async () => {}),
      resolvePermission: vi.fn(async () => {}),
      listProfiles: vi.fn(async () => []),
      importBrowser: vi.fn(async () => ({
        ok: true as const,
        importedCookies: 0,
        importedHistory: 0,
      })),
      detectAccess: vi.fn(async () => ({ ok: true as const })),
      clearBrowsingData: vi.fn(async () => ({ ok: true })),
      onStateChange: vi.fn(() => unsubscribe),
      onFocused: vi.fn(() => unsubscribe),
      onPermissionRequest: vi.fn(() => unsubscribe),
      onContextMenuRequest: vi.fn(() => unsubscribe),
      onOpenInNewTabRequest: vi.fn(() => unsubscribe),
    },
  };
}

type MockWindowApiOverrides = DeepPartial<DevspaceBridge>;

export function installMockWindowApi(overrides: MockWindowApiOverrides = {}): DevspaceBridge {
  const api = mergeDeep(createDefaultWindowApi(), overrides);
  window.api = api;
  return api;
}

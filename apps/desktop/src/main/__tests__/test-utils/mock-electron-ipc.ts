type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

export type IpcHandlerRegistry = Map<string, IpcHandler>;

type ElectronIpcMockOverrides = {
  app?: Record<string, unknown>;
  dialog?: Record<string, unknown>;
  shell?: Record<string, unknown>;
  menu?: Record<string, unknown>;
};

function BrowserWindowMock() {}

export function createIpcHandlerRegistry(): IpcHandlerRegistry {
  return new Map<string, IpcHandler>();
}

export function createElectronIpcMock(
  handlers: IpcHandlerRegistry,
  overrides: ElectronIpcMockOverrides = {},
) {
  return {
    ipcMain: {
      handle: (channel: string, handler: IpcHandler) => {
        handlers.set(channel, handler);
      },
      on: (channel: string, handler: IpcHandler) => {
        handlers.set(channel, handler);
      },
    },
    app: {
      getPath: () => "/tmp/devspace-test",
      isPackaged: false,
      ...overrides.app,
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      ...overrides.dialog,
    },
    shell: {
      openExternal: (_url?: string) => {},
      ...overrides.shell,
    },
    Menu: {
      buildFromTemplate: () => ({ popup: () => {} }),
      ...overrides.menu,
    },
    BrowserWindow: BrowserWindowMock,
  };
}

export function callRegisteredHandler(
  handlers: IpcHandlerRegistry,
  channel: string,
  ...args: unknown[]
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler for ${channel}`);
  }

  return handler({}, ...args);
}

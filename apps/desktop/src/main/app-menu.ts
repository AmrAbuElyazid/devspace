import { app, BrowserWindow, Menu } from "electron";
import {
  DEFAULT_SHORTCUTS,
  getAllNativeBridgeShortcuts,
  resolveShortcut,
  toElectronAccelerator,
  type NativeBridgeShortcut,
  type ShortcutAction,
  type StoredShortcut,
} from "../shared/shortcuts";

type MenuItem = Electron.MenuItemConstructorOptions;

interface ShortcutStoreLike {
  getAllOverrides(): ReadonlyMap<ShortcutAction, StoredShortcut>;
  onChange(callback: () => void): () => void;
}

interface NativeShortcutBridgeLike {
  setReservedShortcuts(shortcuts: NativeBridgeShortcut[]): void;
}

function sendToFocusedWindow(channel: string, ...args: unknown[]): void {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    focusedWindow.webContents.send(channel, ...args);
  }
}

function menuItemsForGroup(
  group: string,
  overrides: ReadonlyMap<ShortcutAction, StoredShortcut>,
): MenuItem[] {
  const definitions = DEFAULT_SHORTCUTS.filter((definition) => definition.menuGroup === group);
  return definitions.map((definition) => {
    const shortcut = resolveShortcut(definition.action, overrides);
    const accelerator = toElectronAccelerator(shortcut);

    if (definition.numbered) {
      const digit = parseInt(definition.action.slice(-1), 10);
      return {
        label: definition.label,
        accelerator,
        click: () => sendToFocusedWindow(definition.ipcChannel, digit),
        visible: false,
      };
    }

    return {
      label: definition.label,
      accelerator,
      click: () => sendToFocusedWindow(definition.ipcChannel),
      visible: !definition.hidden,
    };
  });
}

function buildAppMenu(overrides: ReadonlyMap<ShortcutAction, StoredShortcut>): void {
  const menuTemplate: MenuItem[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        ...menuItemsForGroup("App", overrides),
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: menuItemsForGroup("File", overrides),
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: menuItemsForGroup("View", overrides),
    },
    {
      label: "Browser",
      submenu: menuItemsForGroup("Browser", overrides),
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...menuItemsForGroup("Window", overrides),
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function syncNativeBridgeShortcuts(
  shortcutStore: ShortcutStoreLike,
  terminalManager: NativeShortcutBridgeLike,
): void {
  const overrides = shortcutStore.getAllOverrides();
  terminalManager.setReservedShortcuts(getAllNativeBridgeShortcuts(overrides));
}

export function installDynamicAppMenu(
  shortcutStore: ShortcutStoreLike,
  terminalManager: NativeShortcutBridgeLike,
): void {
  const rebuild = (): void => {
    buildAppMenu(shortcutStore.getAllOverrides());
    syncNativeBridgeShortcuts(shortcutStore, terminalManager);
  };

  rebuild();

  shortcutStore.onChange(() => {
    rebuild();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("shortcuts:changed");
    }
  });
}

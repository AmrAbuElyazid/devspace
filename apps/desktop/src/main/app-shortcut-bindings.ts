import type { BrowserShortcutBinding } from "./browser/browser-types";
import {
  DEFAULT_SHORTCUTS,
  resolveShortcut,
  type ShortcutAction,
  type StoredShortcut,
} from "../shared/shortcuts";

type ShortcutStoreLike = {
  getAllOverrides(): ReadonlyMap<ShortcutAction, StoredShortcut>;
};

export function buildAppShortcutBindings(
  shortcutStore: ShortcutStoreLike | null,
): BrowserShortcutBinding[] {
  if (!shortcutStore) {
    return [];
  }

  const overrides = shortcutStore.getAllOverrides();

  return DEFAULT_SHORTCUTS.map((definition) =>
    definition.numbered
      ? {
          action: definition.action,
          channel: definition.ipcChannel,
          shortcut: resolveShortcut(definition.action, overrides),
          args: [parseInt(definition.action.slice(-1), 10)],
        }
      : {
          action: definition.action,
          channel: definition.ipcChannel,
          shortcut: resolveShortcut(definition.action, overrides),
        },
  );
}

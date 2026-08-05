interface PersistedDirectTerminalConfig {
  cwd?: string;
  backend?: "direct";
}

interface PersistedManagedTmuxTerminalConfig {
  cwd?: string;
  backend: "managed-tmux";
  sessionId: string;
}

interface PersistedExternalTmuxTerminalConfig {
  cwd?: string;
  backend: "external-tmux";
  sessionName: string;
  socketPath?: string;
}

type PersistedTerminalConfig =
  | PersistedDirectTerminalConfig
  | PersistedManagedTmuxTerminalConfig
  | PersistedExternalTmuxTerminalConfig;

interface PersistedBrowserConfig {
  url: string;
  zoom?: number;
}

interface PersistedEditorConfig {
  folderPath?: string;
}

interface PersistedT3CodeConfig {}

interface PersistedNoteConfig {
  noteId: string;
}

/**
 * The config keys each pane type is allowed to persist.
 *
 * A backstop, not bookkeeping. Pane config is written to the state file
 * verbatim, so anything the renderer happens to hang off a pane goes to disk
 * with it — which is how the VS Code connection token, part of an editor
 * pane's URL, ended up being persisted. Unknown keys are dropped on the way
 * in and on the way out rather than rejected, because rejecting would throw
 * away a whole session's state over one stray field.
 */
const PERSISTED_PANE_CONFIG_KEYS: Record<string, readonly string[]> = {
  terminal: ["cwd", "backend", "sessionId", "sessionName", "socketPath"],
  browser: ["url", "zoom", "viewport", "faviconUrl"],
  editor: ["folderPath"],
  t3code: [],
  note: ["noteId"],
};

/** Returns `config` with only the keys `type` is allowed to persist. */
function sanitizePersistedPaneConfig(type: string, config: unknown): unknown {
  const allowed = PERSISTED_PANE_CONFIG_KEYS[type];
  if (!allowed || typeof config !== "object" || config === null || Array.isArray(config)) {
    return config;
  }

  const entries = Object.entries(config as Record<string, unknown>);
  if (entries.every(([key]) => allowed.includes(key))) {
    return config;
  }

  return Object.fromEntries(entries.filter(([key]) => allowed.includes(key)));
}

/** Returns `pane` with any config key its type does not persist removed. */
export function sanitizePersistedPane<T extends { type: string; config: unknown }>(pane: T): T {
  const config = sanitizePersistedPaneConfig(pane.type, pane.config);
  return config === pane.config ? pane : { ...pane, config };
}

/** Returns `panes` with every entry sanitized, preserving identity when clean. */
export function sanitizePersistedPanes<T extends { type: string; config: unknown }>(
  panes: Record<string, T>,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [id, pane] of Object.entries(panes)) {
    const sanitized = sanitizePersistedPane(pane);
    if (sanitized !== pane) changed = true;
    next[id] = sanitized;
  }
  return changed ? next : panes;
}

export type PersistedPane =
  | { id: string; title: string; type: "terminal"; config: PersistedTerminalConfig }
  | { id: string; title: string; type: "browser"; config: PersistedBrowserConfig }
  | { id: string; title: string; type: "editor"; config: PersistedEditorConfig }
  | { id: string; title: string; type: "t3code"; config: PersistedT3CodeConfig }
  | { id: string; title: string; type: "note"; config: PersistedNoteConfig };

export type PersistedSplitDirection = "horizontal" | "vertical";

export type PersistedSplitNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "branch";
      direction: PersistedSplitDirection;
      children: PersistedSplitNode[];
      sizes: number[];
    };

export interface PersistedPaneGroupTab {
  id: string;
  paneId: string;
}

export interface PersistedPaneGroup {
  id: string;
  tabs: PersistedPaneGroupTab[];
  activeTabId: string;
}

export type PersistedSidebarNode =
  | { type: "workspace"; workspaceId: string }
  | {
      type: "folder";
      id: string;
      name: string;
      collapsed: boolean;
      children: PersistedSidebarNode[];
    };

export interface PersistedWorkspace {
  id: string;
  name: string;
  root: PersistedSplitNode;
  focusedGroupId: string | null;
  zoomedGroupId: string | null;
  pinned?: boolean;
  lastActiveAt: number;
  lastTerminalCwd?: string;
}

export interface PersistedWorkspaceState {
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string;
  panes: Record<string, PersistedPane>;
  paneGroups: Record<string, PersistedPaneGroup>;
  pinnedSidebarNodes: PersistedSidebarNode[];
  sidebarTree: PersistedSidebarNode[];
}

export interface PersistedWorkspaceListPatch {
  upsert: PersistedWorkspace[];
  removeIds: string[];
  orderedIds?: string[];
}

export interface PersistedPaneRecordPatch {
  upsert: PersistedPane[];
  removeIds: string[];
}

export interface PersistedPaneGroupRecordPatch {
  upsert: PersistedPaneGroup[];
  removeIds: string[];
}

/**
 * A renderer-to-main persistence delta. Unspecified fields retain their
 * current value. Entity patches are applied atomically and the resulting full
 * graph is validated before it is written to SQLite.
 */
export interface PersistedWorkspacePatch {
  workspaces?: PersistedWorkspaceListPatch;
  activeWorkspaceId?: string;
  panes?: PersistedPaneRecordPatch;
  paneGroups?: PersistedPaneGroupRecordPatch;
  pinnedSidebarNodes?: PersistedSidebarNode[];
  sidebarTree?: PersistedSidebarNode[];
}

function applyRecordPatch<T extends { id: string }>(
  current: Record<string, T>,
  patch: { upsert: T[]; removeIds: string[] },
): Record<string, T> {
  // Spreading walks the record once. Going through Object.entries and a Map
  // would walk it three times to reach the same object with the same key
  // order: deleting drops a key, and assigning an existing one keeps its
  // position, exactly as the Map did.
  const next = { ...current };
  for (const id of patch.removeIds) delete next[id];
  for (const entity of patch.upsert) next[entity.id] = entity;
  return next;
}

export function applyPersistedWorkspacePatch(
  current: PersistedWorkspaceState,
  patch: PersistedWorkspacePatch,
): PersistedWorkspaceState {
  let workspaces = current.workspaces;

  if (patch.workspaces) {
    const workspaceById = new Map(current.workspaces.map((workspace) => [workspace.id, workspace]));
    for (const id of patch.workspaces.removeIds) workspaceById.delete(id);
    for (const workspace of patch.workspaces.upsert) {
      workspaceById.set(workspace.id, workspace);
    }

    if (patch.workspaces.orderedIds) {
      workspaces = patch.workspaces.orderedIds.flatMap((id) => {
        const workspace = workspaceById.get(id);
        return workspace ? [workspace] : [];
      });
    } else {
      workspaces = [...workspaceById.values()];
    }
  }

  return {
    workspaces,
    activeWorkspaceId: patch.activeWorkspaceId ?? current.activeWorkspaceId,
    panes: patch.panes ? applyRecordPatch(current.panes, patch.panes) : current.panes,
    paneGroups: patch.paneGroups
      ? applyRecordPatch(current.paneGroups, patch.paneGroups)
      : current.paneGroups,
    pinnedSidebarNodes: patch.pinnedSidebarNodes ?? current.pinnedSidebarNodes,
    sidebarTree: patch.sidebarTree ?? current.sidebarTree,
  };
}

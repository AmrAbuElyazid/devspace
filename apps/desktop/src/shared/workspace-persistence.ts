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
  const entries = new Map(Object.entries(current));
  for (const id of patch.removeIds) entries.delete(id);
  for (const entity of patch.upsert) entries.set(entity.id, entity);
  return Object.fromEntries(entries);
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

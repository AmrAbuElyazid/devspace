import { create } from "zustand";

import type { DevServerPorts } from "../../shared/dev-server";
import type { Pane } from "../types/workspace";
import { useWorkspaceStore } from "./workspace-store";

/**
 * Which workspaces are serving, and on what.
 *
 * Held apart from the workspace store because the two change for unrelated
 * reasons: ports arrive from a background sweep of the process table, while
 * the workspace graph changes when the user does something. Folding ports into
 * `workspaceSidebarMetadataByWorkspaceId` would mean rebuilding every row's
 * metadata whenever a server restarted.
 *
 * The main process reports ports per tmux session, since that is the unit it
 * can trace a process back to. Turning those into workspaces needs the pane
 * graph, so the mapping is redone whenever either side moves.
 */
interface DevServerState {
  portsBySessionId: Record<string, number[]>;
  /** Merged and de-duplicated across every managed pane in the workspace. */
  portsByWorkspaceId: Record<string, number[]>;
  setPorts: (entries: DevServerPorts[]) => void;
  /** Re-derives the workspace mapping after a pane moved between workspaces. */
  remapWorkspaces: () => void;
}

function managedSessionId(pane: Pane | undefined): string | null {
  if (pane?.type !== "terminal") return null;
  return pane.config.backend === "managed-tmux" ? pane.config.sessionId : null;
}

function mapToWorkspaces(portsBySessionId: Record<string, number[]>): Record<string, number[]> {
  if (Object.keys(portsBySessionId).length === 0) return {};

  const { panes, paneOwnersByPaneId } = useWorkspaceStore.getState();
  const byWorkspace: Record<string, Set<number>> = {};

  for (const [paneId, pane] of Object.entries(panes)) {
    const sessionId = managedSessionId(pane);
    if (!sessionId) continue;
    const ports = portsBySessionId[sessionId];
    if (!ports?.length) continue;
    const workspaceId = paneOwnersByPaneId[paneId]?.workspaceId;
    if (!workspaceId) continue;
    const bucket = (byWorkspace[workspaceId] ??= new Set());
    for (const port of ports) bucket.add(port);
  }

  const result: Record<string, number[]> = {};
  for (const [workspaceId, ports] of Object.entries(byWorkspace)) {
    result[workspaceId] = [...ports].toSorted((a, b) => a - b);
  }
  return result;
}

/** Same keys, same values, in the same order — so an unchanged sweep is a no-op. */
function sameMapping(left: Record<string, number[]>, right: Record<string, number[]>): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => {
    const a = left[key];
    const b = right[key];
    return a?.length === b?.length && a?.every((port, index) => port === b?.[index]);
  });
}

export const useDevServerStore = create<DevServerState>()((set, get) => ({
  portsBySessionId: {},
  portsByWorkspaceId: {},

  setPorts: (entries) => {
    const portsBySessionId: Record<string, number[]> = {};
    for (const entry of entries) {
      if (entry.ports.length > 0) portsBySessionId[entry.sessionId] = entry.ports;
    }
    const portsByWorkspaceId = mapToWorkspaces(portsBySessionId);
    if (sameMapping(portsByWorkspaceId, get().portsByWorkspaceId)) {
      set({ portsBySessionId });
      return;
    }
    set({ portsBySessionId, portsByWorkspaceId });
  },

  remapWorkspaces: () => {
    const portsByWorkspaceId = mapToWorkspaces(get().portsBySessionId);
    if (sameMapping(portsByWorkspaceId, get().portsByWorkspaceId)) return;
    set({ portsByWorkspaceId });
  },
}));

/**
 * Keep the mapping honest when a pane changes hands.
 *
 * `paneOwnersByPaneId` is rebuilt by identity on every structural change, so
 * comparing references catches a pane being dragged to another workspace, a
 * workspace being deleted, and a session being restored — without running on
 * every keystroke that touches the store.
 */
useWorkspaceStore.subscribe((state, previous) => {
  if (state.paneOwnersByPaneId === previous.paneOwnersByPaneId) return;
  useDevServerStore.getState().remapWorkspaces();
});

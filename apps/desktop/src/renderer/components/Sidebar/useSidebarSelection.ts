import { useCallback, useEffect, useMemo, useState } from "react";

import { collectWorkspaceIds } from "@/lib/sidebar-tree";
import type { SidebarNode } from "@/types/workspace";

interface SidebarSelection {
  selectedIds: Set<string>;
  /** Resolves a row click into either activation or a selection change. */
  handleRowClick: (workspaceId: string, event: React.MouseEvent) => void;
  /** The ids a context-menu/toolbar action should apply to. */
  actionTargets: (workspaceId: string) => string[];
  selectOnly: (workspaceId: string) => void;
  clear: () => void;
}

const isToggleModifier = (event: React.MouseEvent): boolean => event.metaKey || event.ctrlKey;

/**
 * Finder-style multi-select for the workspace list.
 *
 * A plain click still just opens a workspace — selection only appears once the
 * user asks for it with ⌘ or ⇧, so the common case is unchanged. Ranges are
 * computed over the *visible* order (pinned above main, collapsed folders
 * skipped), which is the order the user is actually pointing at.
 */
export function useSidebarSelection(
  pinnedSidebarNodes: SidebarNode[],
  sidebarTree: SidebarNode[],
  knownWorkspaceIds: Set<string>,
  onActivate: (workspaceId: string) => void,
): SidebarSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const visibleOrder = useMemo(
    () => [...collectWorkspaceIds(pinnedSidebarNodes), ...collectWorkspaceIds(sidebarTree)],
    [pinnedSidebarNodes, sidebarTree],
  );

  // Deleting a selected workspace elsewhere (shortcut, tab drag) must not leave
  // a phantom in the count.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((id) => knownWorkspaceIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [knownWorkspaceIds]);

  const clear = useCallback(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
    setAnchorId(null);
  }, []);

  const selectOnly = useCallback((workspaceId: string) => {
    setSelectedIds(new Set([workspaceId]));
    setAnchorId(workspaceId);
  }, []);

  const handleRowClick = useCallback(
    (workspaceId: string, event: React.MouseEvent) => {
      if (isToggleModifier(event)) {
        event.preventDefault();
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(workspaceId)) next.delete(workspaceId);
          else next.add(workspaceId);
          return next;
        });
        setAnchorId(workspaceId);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        const from = visibleOrder.indexOf(anchorId ?? workspaceId);
        const to = visibleOrder.indexOf(workspaceId);
        if (from === -1 || to === -1) {
          selectOnly(workspaceId);
          return;
        }
        const [start, end] = from <= to ? [from, to] : [to, from];
        setSelectedIds(new Set(visibleOrder.slice(start, end + 1)));
        return;
      }

      clear();
      onActivate(workspaceId);
    },
    [anchorId, clear, onActivate, selectOnly, visibleOrder],
  );

  // A menu opened on a row inside the selection acts on the whole selection;
  // opened anywhere else it acts on that row alone.
  const actionTargets = useCallback(
    (workspaceId: string): string[] =>
      selectedIds.size > 1 && selectedIds.has(workspaceId) ? [...selectedIds] : [workspaceId],
    [selectedIds],
  );

  return { selectedIds, handleRowClick, actionTargets, selectOnly, clear };
}

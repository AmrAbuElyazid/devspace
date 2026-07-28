import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collectSelectionKeys,
  folderSelectionKey,
  workspaceSelectionKey,
  type SidebarSelectionKey,
} from "@/lib/sidebar-tree";
import type { SidebarNode } from "@/types/workspace";

interface SidebarSelection {
  selectedKeys: Set<string>;
  /** Resolves a workspace row click into either activation or a selection change. */
  handleWorkspaceClick: (workspaceId: string, event: React.MouseEvent) => void;
  /**
   * Resolves a folder row click. Without a modifier a folder still just
   * expands or collapses, so `false` means "the caller should do that".
   */
  handleFolderClick: (folderId: string, event: React.MouseEvent) => boolean;
  /** The keys a context-menu/toolbar action should apply to. */
  actionTargets: (key: SidebarSelectionKey) => string[];
  clear: () => void;
}

const isToggleModifier = (event: React.MouseEvent): boolean => event.metaKey || event.ctrlKey;

/**
 * Finder-style multi-select over the sidebar tree.
 *
 * A plain click still just opens a workspace or folds a folder — selection
 * only appears once the user asks for it with ⌘ or ⇧, so the common case is
 * unchanged. Folders and workspaces share one selection (see
 * `SidebarSelectionKey`) so a single bulk delete can span both. Ranges run
 * along the *visible* order — pinned above main, collapsed folders counted but
 * not their contents — which is the order the user is pointing at.
 */
export function useSidebarSelection(
  pinnedSidebarNodes: SidebarNode[],
  sidebarTree: SidebarNode[],
  onActivateWorkspace: (workspaceId: string) => void,
): SidebarSelection {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);

  const visibleOrder = useMemo(
    () => [...collectSelectionKeys(pinnedSidebarNodes), ...collectSelectionKeys(sidebarTree)],
    [pinnedSidebarNodes, sidebarTree],
  );

  // Existence, not visibility: collapsing a folder must not silently drop the
  // rows inside it from the selection, but deleting one elsewhere must.
  const existingKeys = useMemo(
    () =>
      new Set<string>([
        ...collectSelectionKeys(pinnedSidebarNodes, true),
        ...collectSelectionKeys(sidebarTree, true),
      ]),
    [pinnedSidebarNodes, sidebarTree],
  );

  useEffect(() => {
    setSelectedKeys((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((key) => existingKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [existingKeys]);

  const clear = useCallback(() => {
    setSelectedKeys((current) => (current.size === 0 ? current : new Set()));
    setAnchorKey(null);
  }, []);

  /** Returns true when the modifiers meant "change the selection". */
  const applyModifiedClick = useCallback(
    (key: SidebarSelectionKey, event: React.MouseEvent): boolean => {
      if (isToggleModifier(event)) {
        event.preventDefault();
        setSelectedKeys((current) => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        setAnchorKey(key);
        return true;
      }

      if (event.shiftKey) {
        event.preventDefault();
        const from = visibleOrder.indexOf((anchorKey as SidebarSelectionKey | null) ?? key);
        const to = visibleOrder.indexOf(key);
        if (from === -1 || to === -1) {
          setSelectedKeys(new Set([key]));
          setAnchorKey(key);
          return true;
        }
        const [start, end] = from <= to ? [from, to] : [to, from];
        setSelectedKeys(new Set(visibleOrder.slice(start, end + 1)));
        return true;
      }

      return false;
    },
    [anchorKey, visibleOrder],
  );

  const handleWorkspaceClick = useCallback(
    (workspaceId: string, event: React.MouseEvent) => {
      if (applyModifiedClick(workspaceSelectionKey(workspaceId), event)) return;
      clear();
      onActivateWorkspace(workspaceId);
    },
    [applyModifiedClick, clear, onActivateWorkspace],
  );

  const handleFolderClick = useCallback(
    (folderId: string, event: React.MouseEvent): boolean =>
      applyModifiedClick(folderSelectionKey(folderId), event),
    [applyModifiedClick],
  );

  // A menu opened on a row inside the selection acts on the whole selection;
  // opened anywhere else it acts on that row alone.
  const actionTargets = useCallback(
    (key: SidebarSelectionKey): string[] =>
      selectedKeys.size > 1 && selectedKeys.has(key) ? [...selectedKeys] : [key],
    [selectedKeys],
  );

  return { selectedKeys, handleWorkspaceClick, handleFolderClick, actionTargets, clear };
}

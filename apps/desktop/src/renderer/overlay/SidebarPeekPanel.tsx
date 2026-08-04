import { useEffect, useRef, type ReactElement } from "react";

import { WorkspaceRow } from "@/components/Sidebar/WorkspaceRow";
import type { SidebarPeekSnapshot } from "../../shared/sidebar-peek";

/** The card's 1px top and bottom border, which neither measurement includes. */
const CARD_BORDER = 2;

/**
 * The collapsed sidebar, revealed on hover.
 *
 * Drawn here rather than in the main renderer because a terminal is an AppKit
 * view sitting above Electron's entire view tree — anything the app painted
 * over that area would be sliced off at the terminal's edge. This document
 * belongs to a child *window*, which is above the terminal instead of below it.
 *
 * Read-only on purpose. Rows navigate; renaming, dragging and the context menu
 * all stay in the real sidebar, where there is a store to change.
 */
export function SidebarPeekPanel({
  snapshot,
  onActivate,
}: {
  snapshot: SidebarPeekSnapshot;
  onActivate: (workspaceId: string) => void;
}): ReactElement {
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The window opens at the full height of the workspace and is then trimmed
  // to whatever this measures. Doing it the other way round — deriving a height
  // from the row count in the main process — would put this file's padding and
  // line heights into a second codebase that cannot see them.
  //
  // The list's `scrollHeight` rather than the card's: the card is capped at the
  // window it is being measured for, so measuring it would shrink the window,
  // which would shrink the card, and so on down to nothing. A scroll
  // container's `scrollHeight` is its full content regardless of how short it
  // has been squeezed.
  useEffect(() => {
    const header = headerRef.current;
    const list = listRef.current;
    if (!header || !list) return;

    const report = (): void =>
      window.api.sidebarPeek.reportHeight(header.offsetHeight + list.scrollHeight + CARD_BORDER);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(list);
    return () => observer.disconnect();
  }, [snapshot]);

  return (
    <div className="glass-dialog absolute inset-x-0 top-0 flex max-h-full flex-col overflow-hidden rounded-xl border border-border shadow-2xl">
      <div
        ref={headerRef}
        className="px-3 pt-2.5 pb-1 text-ui-micro font-medium tracking-wide text-muted-foreground uppercase"
      >
        Workspaces
      </div>
      <div ref={listRef} className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
        {snapshot.rows.map((row) =>
          row.kind === "folder" ? (
            <div
              key={`folder-${row.id}`}
              style={{ marginLeft: row.depth * 13 }}
              className="truncate px-2.5 pt-2 pb-1 text-ui-micro font-medium tracking-wide text-muted-foreground uppercase"
            >
              {row.name}
            </div>
          ) : (
            <WorkspaceRow
              key={`ws-${row.id}`}
              name={row.name}
              color={row.color}
              directory={row.directory}
              ports={row.ports}
              paneCount={row.paneCount}
              isActive={row.active}
              isCompact={snapshot.compact}
              depth={row.depth}
              role="button"
              tabIndex={-1}
              onClick={() => onActivate(row.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

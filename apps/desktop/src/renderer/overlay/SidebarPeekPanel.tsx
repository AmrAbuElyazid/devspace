import type { ReactElement } from "react";

import { WorkspaceRow } from "@/components/Sidebar/WorkspaceRow";
import type { SidebarPeekSnapshot } from "../../shared/sidebar-peek";

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
  return (
    <div className="glass-dialog absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border shadow-2xl">
      <div className="px-3 pt-2.5 pb-1 text-ui-micro font-medium tracking-wide text-muted-foreground uppercase">
        Workspaces
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
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

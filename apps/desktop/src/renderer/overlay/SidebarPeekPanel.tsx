import type { ReactElement } from "react";

import { SidebarSectionHeader } from "@/components/Sidebar/SidebarSectionHeader";
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
 * It is meant to read as the sidebar, not as a menu of workspaces: the same
 * width, the same sections in the same order, the same rows and headers, drawn
 * by the same components. A trimmed-down popup with a different shape asks the
 * user to recognise a second thing.
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
    <div className="glass-dialog absolute inset-0 flex flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-border pb-2 shadow-2xl">
      {snapshot.sections.map((section) => (
        <div key={section.label} className="contents">
          <SidebarSectionHeader label={section.label} count={section.count} />
          <div className="flex flex-col gap-0.5 px-2">
            {section.rows.map((row) =>
              row.kind === "folder" ? (
                <div
                  key={`folder-${row.id}`}
                  style={{ marginLeft: row.depth * 13 }}
                  // `pl-[22px]` puts the label where the sidebar's own folder
                  // label sits — past the disclosure twisty this read-only copy
                  // has no use for but still has to line up with.
                  className="flex h-6 items-center pr-1.5 pl-[22px] text-ui-xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
                >
                  <span className="truncate">{row.name}</span>
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
      ))}
    </div>
  );
}

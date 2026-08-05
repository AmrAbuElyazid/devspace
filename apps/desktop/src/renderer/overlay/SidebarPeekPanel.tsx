import { useEffect, useState, type ReactElement } from "react";

import { SidebarSectionHeader } from "@/components/Sidebar/SidebarSectionHeader";
import { WorkspaceRow } from "@/components/Sidebar/WorkspaceRow";
import { cn } from "@/lib/utils";
import { SIDEBAR_PEEK_ANIMATION_MS, type SidebarPeekSnapshot } from "../../shared/sidebar-peek";

/**
 * The collapsed sidebar, revealed on hover.
 *
 * Drawn here rather than in the main renderer because a terminal is an AppKit
 * view sitting above Electron's entire view tree — anything the app painted
 * over that area would be sliced off at the terminal's edge. This document
 * belongs to a child *window*, which is above the terminal instead of below it.
 *
 * It is meant to read as the sidebar, not as a menu of workspaces: the same
 * width and surface, hard against the same edge, the same sections in the same
 * order, the same rows and headers drawn by the same components.
 *
 * Read-only on purpose. Rows navigate; renaming, dragging and the context menu
 * all stay in the real sidebar, where there is a store to change.
 */
export function SidebarPeekPanel({
  snapshot,
  open,
  onActivate,
}: {
  snapshot: SidebarPeekSnapshot;
  open: boolean;
  onActivate: (workspaceId: string) => void;
}): ReactElement {
  // A frame behind `open`, so the first reveal has an off-screen position to
  // transition *from*. Setting both in the same commit would paint it in place
  // and skip the animation entirely.
  const [slidIn, setSlidIn] = useState(false);
  useEffect(() => {
    if (!open) {
      setSlidIn(false);
      return;
    }
    const frame = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      data-peek-panel
      style={{ transitionDuration: `${SIDEBAR_PEEK_ANIMATION_MS}ms` }}
      className={cn(
        // The sidebar's own surface and edge, not a dialog's: this is the
        // sidebar arriving, not a card floating above the workspace. The
        // bottom-left corner is rounded to sit inside the window's own.
        "absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto",
        "surface-grain rounded-bl-[10px] border-r border-border bg-rail pb-2",
        // `translate`, not `transform`: Tailwind v4's `translate-x-*` sets the
        // standalone property, so a transition list naming `transform` animates
        // the fade and snaps the position.
        "transition-[translate,opacity] ease-out will-change-transform",
        slidIn ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0",
      )}
    >
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

import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";

import { formatSidebarDirectory } from "@/lib/sidebar-directory";
import { cn } from "@/lib/utils";

interface WorkspaceRowProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  /** Resolved CSS colour for the identity stripe and the active tint. */
  color: string;
  directory: string | null;
  ports?: number[];
  paneCount: number;
  isActive: boolean;
  isCompact: boolean;
  isSelected?: boolean;
  /** Nesting depth inside folders. */
  depth?: number;
  /** Replaces the name, for the inline rename field. */
  nameSlot?: ReactNode;
  /** Replaces the pane count, for the ⌘n hint. */
  countSlot?: ReactNode;
  style?: CSSProperties;
}

/**
 * A workspace as it appears in the sidebar, with no idea where it is.
 *
 * Purely presentational so the same row can be drawn twice: once by
 * `SortableWorkspaceItem`, wired to the store and to dnd-kit, and once by the
 * peek panel — which lives in a *different renderer process* with no store to
 * read and no drag to take part in. Two hand-kept copies of this markup would
 * drift the moment either side was touched.
 */
export const WorkspaceRow = forwardRef<HTMLDivElement, WorkspaceRowProps>(function WorkspaceRow(
  {
    name,
    color,
    directory,
    ports,
    paneCount,
    isActive,
    isCompact,
    isSelected = false,
    depth = 0,
    nameSlot,
    countSlot,
    className,
    style,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        marginLeft: depth * 13,
        // Tinted with the workspace's own hue rather than one shared amber, so
        // the active row reads as "this workspace" and not just "selected".
        ...(isActive && !isSelected
          ? { backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)` }
          : {}),
        ...style,
      }}
      data-active={isActive || undefined}
      data-selected={isSelected || undefined}
      className={cn(
        "group/ws relative flex items-center gap-2 rounded-md pr-2 pl-2.5",
        "chrome-focus no-drag cursor-default select-none transition-colors duration-100",
        isCompact ? "min-h-[26px]" : "min-h-9 py-1",
        "hover:bg-row-hover",
        isSelected && "bg-row-selected ring-1 ring-inset ring-brand-edge",
        className,
      )}
      {...rest}
    >
      {/* Identity stripe. Two pixels of the workspace's own colour, hard against
          the leading edge, so a row is recognisable before its name is read. */}
      <span
        aria-hidden
        style={{ backgroundColor: color }}
        className={cn(
          "absolute left-0 rounded-full transition-all",
          isActive ? "inset-y-1 w-[2.5px] opacity-100" : "inset-y-[7px] w-0.5 opacity-80",
        )}
      />

      {isSelected ? <Check size={13} strokeWidth={2.4} className="shrink-0 text-brand" /> : null}

      <div className="flex min-w-0 flex-1 flex-col gap-px">
        {nameSlot ?? (
          <span
            className={cn(
              "truncate leading-tight text-ui-sm",
              isActive ? "font-medium text-foreground" : "text-foreground/[0.88]",
            )}
          >
            {name}
          </span>
        )}
        {/* Truncated from the left, because the tail of a path is what tells
            two sibling worktrees apart. */}
        {!nameSlot && !isCompact && directory ? (
          <span
            title={directory}
            // rtl puts the ellipsis on the left, so the tail of the path — the
            // part that identifies it — survives. formatSidebarDirectory
            // prefixes an LTR mark to stop the leading "~/" being reordered.
            style={{ direction: "rtl" }}
            className="truncate text-left font-mono text-ui-micro leading-none text-muted-foreground"
          >
            {formatSidebarDirectory(directory)}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Fixed order — port, then pane count — so the right edge of the list
            stays a straight line however many rows are serving. */}
        {ports && ports.length > 0 ? (
          <span
            title={
              ports.length > 1
                ? `Listening on ports ${ports.join(", ")}`
                : `Listening on port ${ports[0]}`
            }
            className="flex items-center gap-1 rounded-[5px] bg-success/[0.14] py-px pr-[5px] pl-1 font-mono text-ui-micro leading-none text-success"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-success" />:{ports[0]}
            {ports.length > 1 ? <span className="opacity-60">+{ports.length - 1}</span> : null}
          </span>
        ) : null}
        {countSlot ??
          (paneCount > 0 ? (
            <span className="min-w-2 text-right font-mono text-ui-micro tabular-nums text-muted-foreground">
              {paneCount}
            </span>
          ) : null)}
      </div>
    </div>
  );
});

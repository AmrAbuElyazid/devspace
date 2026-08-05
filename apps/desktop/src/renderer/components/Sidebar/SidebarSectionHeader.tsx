import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * "PINNED" / "WORKSPACES", above the list each one heads.
 *
 * Shared with the peek panel, which draws the same sidebar from a different
 * renderer process and would otherwise drift from this one.
 *
 * `pl-[18px]` is not arbitrary: the rows below sit in a `px-2` list and carry
 * `pl-2.5` of their own, so their names start 18px in. Anything else leaves the
 * label hanging off the left of the column it heads. `pr-4` lines the count and
 * any buttons up with the rows' own right inset.
 */
export function SidebarSectionHeader({
  label,
  count,
  className,
  children,
}: {
  label: string;
  count?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-3 mb-0.5 flex h-6 items-center gap-1.5 pr-4 pl-[18px]",
        "select-none text-muted-foreground",
        className,
      )}
    >
      <span className="flex-1 truncate text-ui-xs font-medium tracking-[0.06em] uppercase">
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="shrink-0 font-mono text-ui-micro tabular-nums opacity-55">{count}</span>
      ) : null}
      {children ? <div className="flex shrink-0 items-center gap-0.5">{children}</div> : null}
    </div>
  );
}

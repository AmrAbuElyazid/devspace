import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border",
        "border-border/60 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

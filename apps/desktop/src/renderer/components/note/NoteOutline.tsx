import type { ReactElement } from "react";
import type { OutlineEntry } from "@devspace/note-editor";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface NoteOutlineProps {
  entries: OutlineEntry[];
  foldedIndices: number[];
  onSelect: (entry: OutlineEntry) => void;
  onToggleFold: (entry: OutlineEntry) => void;
}

/**
 * Heading list for the current note.
 *
 * Doubles as the fold control: a section collapsed from here is the same fold
 * as one collapsed from the document gutter, so the two views can't disagree
 * about what is hidden.
 */
export default function NoteOutline({
  entries,
  foldedIndices,
  onSelect,
  onToggleFold,
}: NoteOutlineProps): ReactElement {
  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-l border-border bg-rail">
      <div className="shrink-0 px-3 pt-2.5 pb-1.5 text-ui-micro font-medium tracking-[0.08em] text-muted-foreground/70 uppercase">
        Outline
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-1 text-ui-xs text-muted-foreground/70">
          Headings appear here as you add them.
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {entries.map((entry) => {
            const folded = foldedIndices.includes(entry.path);

            return (
              <div key={`${entry.path}-${entry.id}`} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onToggleFold(entry)}
                  aria-label={folded ? `Expand ${entry.title}` : `Collapse ${entry.title}`}
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    size={11}
                    className={cn("transition-transform", !folded && "rotate-90")}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  title={entry.title}
                  className={cn(
                    "chrome-focus min-w-0 flex-1 truncate rounded-md py-1 pr-1.5 text-left text-ui-xs",
                    "text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground",
                    entry.level === 1 && "font-medium text-foreground/90",
                  )}
                  // Indent by rank rather than nesting DOM: headings can skip
                  // levels, and a tree would have to invent parents for them.
                  style={{ paddingLeft: `${(entry.level - 1) * 10}px` }}
                >
                  {entry.title}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import type { ReactElement } from "react";
import type { NoteStats } from "@devspace/note-editor";
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  FilesIcon,
  FolderOpenIcon,
  ListTreeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  ShareIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HintTooltip } from "@/components/ui/hint-tooltip";

export type SaveStatus = "saved" | "saving" | "unsaved" | "failed";

interface NoteFooterProps {
  onExport: () => void;
  onOpenExternal: () => void;
  onReveal: () => void;
  onSwitchNote: () => void;
  onToggleOutline: () => void;
  outlineOpen: boolean;
  saveError: string | null;
  saveStatus: SaveStatus;
  stats: NoteStats;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  failed: "Save failed",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
};

function StatusIcon({ status }: { status: SaveStatus }) {
  if (status === "saving") return <Loader2Icon size={11} className="animate-spin" />;
  if (status === "failed") return <AlertTriangleIcon size={11} />;
  if (status === "saved") return <CheckIcon size={11} />;
  return <span className="size-1.5 rounded-full bg-current" />;
}

/**
 * Status strip along the bottom of a note pane.
 *
 * Save state lives here rather than in the red banner the pane used to grow at
 * the top: that banner shifted the whole document down the moment anything went
 * wrong, which moved the text out from under the cursor mid-keystroke.
 */
export default function NoteFooter({
  onExport,
  onOpenExternal,
  onReveal,
  onSwitchNote,
  onToggleOutline,
  outlineOpen,
  saveError,
  saveStatus,
  stats,
}: NoteFooterProps): ReactElement {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-rail px-2 text-ui-micro text-muted-foreground">
      <HintTooltip dense content={saveError ?? STATUS_LABEL[saveStatus]}>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 tabular-nums",
            saveStatus === "failed" && "text-destructive",
            saveStatus === "saved" && "text-success-foreground",
          )}
        >
          <StatusIcon status={saveStatus} />
          {STATUS_LABEL[saveStatus]}
        </span>
      </HintTooltip>

      <span className="text-border">·</span>

      <span className="tabular-nums">
        {stats.words.toLocaleString()} {stats.words === 1 ? "word" : "words"}
      </span>
      <span className="text-border">·</span>
      <span className="tabular-nums">{stats.characters.toLocaleString()} chars</span>
      {stats.readingMinutes > 0 && (
        <>
          <span className="text-border">·</span>
          <span className="tabular-nums">{stats.readingMinutes} min read</span>
        </>
      )}

      <div className="flex-1" />

      <HintTooltip dense content={outlineOpen ? "Hide outline" : "Show outline"}>
        <button
          type="button"
          onClick={onToggleOutline}
          aria-label={outlineOpen ? "Hide outline" : "Show outline"}
          aria-pressed={outlineOpen}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded transition-colors",
            "hover:bg-row-hover hover:text-foreground",
            outlineOpen && "bg-row-active text-foreground",
          )}
        >
          <ListTreeIcon size={12} />
        </button>
      </HintTooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Note actions"
          className="inline-flex size-5 items-center justify-center rounded transition-colors hover:bg-row-hover hover:text-foreground"
        >
          <MoreHorizontalIcon size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[190px]">
          <DropdownMenuItem onSelect={onSwitchNote}>
            <FilesIcon />
            Open another note…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onReveal}>
            <FolderOpenIcon />
            Reveal in Finder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenExternal}>
            <ExternalLinkIcon />
            Open in default editor
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExport}>
            <ShareIcon />
            Export markdown…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

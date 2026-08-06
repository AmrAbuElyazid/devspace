import { useEffect, useState, type ReactElement } from "react";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface NoteSwitcherProps {
  currentNoteId: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (noteId: string) => void;
  open: boolean;
}

interface NoteEntry {
  id: string;
  title: string;
}

/** First non-empty line, stripped of markdown syntax — the same rule the pane title uses. */
function titleFromMarkdown(markdown: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const plain = line
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^\[[ xX]\]\s+/, "")
      .replace(/[*_`~]/g, "")
      .trim();
    if (plain) return plain.slice(0, 60);
  }
  return "Untitled note";
}

/**
 * Point this pane at a different note.
 *
 * Notes have no home outside the pane that made them, so without this a note is
 * only reachable by whichever tab happened to create it — close the tab and it
 * is on disk but unreachable from the app.
 */
export default function NoteSwitcher({
  currentNoteId,
  onOpenChange,
  onSelect,
  open,
}: NoteSwitcherProps): ReactElement {
  const [entries, setEntries] = useState<NoteEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      const ids = await window.api.notes.list();
      const loaded = await Promise.all(
        ids.map(async (id) => ({
          id,
          title: titleFromMarkdown((await window.api.notes.read(id)) ?? ""),
        })),
      );
      if (!cancelled) setEntries(loaded);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Open note">
      <CommandInput placeholder="Search notes…" />
      <CommandList>
        <CommandEmpty>No notes yet.</CommandEmpty>

        <CommandGroup>
          <CommandItem
            value="__new__ create new note"
            onSelect={() => {
              onSelect(nanoid());
              onOpenChange(false);
            }}
          >
            <PlusIcon />
            New note
          </CommandItem>
        </CommandGroup>

        {entries.length > 0 && (
          <CommandGroup heading="Notes">
            {entries.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`${entry.title} ${entry.id}`}
                disabled={entry.id === currentNoteId}
                onSelect={() => {
                  onSelect(entry.id);
                  onOpenChange(false);
                }}
              >
                <FileTextIcon />
                <span className="truncate">{entry.title}</span>
                {entry.id === currentNoteId && (
                  <span className="ml-auto text-ui-micro text-muted-foreground">current</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

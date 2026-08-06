"use client";

import type { Descendant, TRange } from "platejs";
import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf, createPlatePlugin } from "platejs/react";

import { cn } from "../lib/cn";
import { isSameRange, matchesInElement } from "../find-matches";

/**
 * Search highlighting for the pane's find bar.
 *
 * Decorating from the same matcher the pane counts and replaces with means
 * there is one definition of "a match" rather than two that have to agree —
 * previously the counter and the highlights came from different code, and a
 * stale one was invisible.
 *
 * The current match is marked by a decoration, not by selecting it. Selecting
 * inside the editor makes Slate sync the DOM selection, which pulls focus out
 * of the find input and sends the user's next keystroke into the note.
 */
export const NoteSearchPlugin = createPlatePlugin({
  key: "note_search",
  node: { isLeaf: true },
  options: { activeRange: null as TRange | null, query: "" },
}).extend(({ getOptions, type }) => ({
  decorate: ({ entry: [node, path] }) => {
    const { activeRange, query } = getOptions();

    return matchesInElement(node as Descendant, path, query).map((range) => ({
      ...range,
      [type]: true,
      noteSearchActive: isSameRange(range, activeRange),
    }));
  },
}));

function SearchLeaf(props: PlateLeafProps) {
  const active = props.leaf.noteSearchActive === true;

  return (
    <PlateLeaf
      {...props}
      as="mark"
      attributes={{
        ...props.attributes,
        "data-note-search-active": active ? "true" : undefined,
      }}
      className={cn(
        "rounded-[2px] text-inherit",
        active ? "bg-warning/70 text-foreground" : "bg-warning/30",
      )}
    >
      {props.children}
    </PlateLeaf>
  );
}

export const FindReplaceKit = [NoteSearchPlugin.withComponent(SearchLeaf)];

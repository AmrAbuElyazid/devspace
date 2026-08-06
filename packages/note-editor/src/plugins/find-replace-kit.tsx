"use client";

import { FindReplacePlugin } from "@platejs/find-replace";
import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf, toPlatePlugin } from "platejs/react";

/**
 * Highlights for the pane's find bar.
 *
 * The plugin only paints matches; stepping between them is done by selecting
 * the range, so the current match is shown by the editor's own selection. That
 * keeps "what is highlighted" and "where next lands" from ever disagreeing —
 * see `find-matches.ts`, which mirrors this plugin's matching rules.
 */
function SearchHighlightLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="mark" className="rounded-[2px] bg-warning/35 text-inherit">
      {props.children}
    </PlateLeaf>
  );
}

export const FindReplaceKit = [toPlatePlugin(FindReplacePlugin).withComponent(SearchHighlightLeaf)];

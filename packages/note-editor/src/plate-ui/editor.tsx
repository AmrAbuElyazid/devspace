"use client";

import * as React from "react";

import { PlateContainer, PlateContent } from "platejs/react";

import { cn } from "../lib/cn";

/**
 * The editor surface, sized for a pane rather than a page.
 *
 * Plate's scaffold ships `px-16 pb-72 sm:px-[max(64px,calc(50%-350px))]` at
 * `text-base` — a document viewport. Devspace panes are routinely half a split,
 * where that leaves a column of text a few words wide under 288px of dead space.
 * Padding is driven by container queries against the pane's own width instead of
 * the viewport, so a narrow split tightens up while a wide one still gets a
 * comfortable measure.
 *
 * The left inset never drops below `pl-9`: the block gutter is positioned at
 * `right-full` of each block and would be clipped by anything smaller.
 */
export function EditorContainer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PlateContainer>) {
  return (
    <PlateContainer
      className={cn(
        "@container/note ignore-click-outside/toolbar",
        "relative h-full w-full cursor-text overflow-y-auto",
        "caret-foreground selection:bg-brand-soft",
        "focus-visible:outline-none",
        "[&_.slate-selection-area]:z-50 [&_.slate-selection-area]:rounded-sm",
        "[&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand-edge",
        "[&_.slate-selection-area]:bg-brand-soft",
        className,
      )}
      {...props}
    />
  );
}

const editorClass = cn(
  "group/editor note-prose",
  "relative w-full cursor-text overflow-x-hidden break-words whitespace-pre-wrap",
  "focus-visible:outline-none",
  // Room for the block gutter at every width; breathing room once there is any.
  "mx-auto py-3 pr-3 pl-9",
  "@lg/note:py-4 @lg/note:pr-8 @lg/note:pl-12",
  "@3xl/note:max-w-[74ch] @3xl/note:pr-14 @3xl/note:pl-14",
  // Enough runway to click below the last block and land at the end of the note.
  "pb-24",
);

export type EditorProps = React.ComponentPropsWithoutRef<typeof PlateContent>;

export const Editor = React.forwardRef<React.ElementRef<typeof PlateContent>, EditorProps>(
  function Editor({ className, ...props }, ref) {
    return (
      <PlateContent
        ref={ref}
        className={cn(editorClass, className)}
        disableDefaultStyles
        {...props}
      />
    );
  },
);

Editor.displayName = "Editor";

"use client";

import { createPlatePlugin } from "platejs/react";

/**
 * Collapsible headings.
 *
 * Folding is a view concern only — nothing about it reaches the markdown file,
 * so a folded note is byte-identical to an unfolded one and stays readable in
 * any other editor. State is a set of block indices rather than node ids
 * because notes are loaded from markdown, where no node carries an id.
 *
 * The hiding itself happens in `block-draggable.tsx`, which already wraps every
 * top level block, so no second render pass is needed. The range each fold owns
 * is computed by `hiddenBlockIndices` in `heading-fold.ts`.
 */
export const HeadingFoldPlugin = createPlatePlugin({
  key: "heading-fold",
  options: { folded: [] as number[] },
});

export const HeadingFoldKit = [HeadingFoldPlugin];

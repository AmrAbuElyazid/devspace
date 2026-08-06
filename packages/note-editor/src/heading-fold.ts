import type { Value } from "platejs";

import { headingLevel } from "./note-outline";

/**
 * Which top level blocks are hidden by a collapsed heading.
 *
 * A heading owns everything after it up to the next heading of the same or a
 * higher rank, so folding `## Setup` hides its paragraphs and any `###` beneath
 * it, but stops at the next `##` or `#`. Folded headings nested inside another
 * folded heading are still recorded as hidden, which is what lets a fold survive
 * being wrapped in a larger one.
 *
 * Returns block indices rather than ids: folding is a view concern, so it must
 * work on notes loaded from markdown, where no node has an id yet.
 */
export function hiddenBlockIndices(value: Value, foldedIndices: ReadonlySet<number>): Set<number> {
  const hidden = new Set<number>();
  if (foldedIndices.size === 0) return hidden;

  for (const start of foldedIndices) {
    const level = headingLevel(value[start]);
    if (level === null) continue;

    for (let index = start + 1; index < value.length; index++) {
      const candidate = headingLevel(value[index]);
      if (candidate !== null && candidate <= level) break;
      hidden.add(index);
    }
  }

  return hidden;
}

let cachedValue: Value | null = null;
let cachedFolded: readonly number[] | null = null;
let cachedResult = new Set<number>();

/**
 * Single-entry memo of `hiddenBlockIndices`.
 *
 * Every block wrapper asks the same question with the same arguments during a
 * render pass, so computing it per block made folding O(blocks²). React renders
 * a tree synchronously, so one slot is all the cache needs.
 */
export function hiddenBlockIndicesFor(value: Value, folded: readonly number[]): Set<number> {
  if (value === cachedValue && folded === cachedFolded) return cachedResult;

  cachedValue = value;
  cachedFolded = folded;
  cachedResult = hiddenBlockIndices(value, new Set(folded));
  return cachedResult;
}

/**
 * Drop folds that no longer point at a heading.
 *
 * Editing shifts block indices around, and a stale fold would hide an unrelated
 * run of the document with no visible chevron to undo it.
 */
export function pruneFolds(value: Value, foldedIndices: ReadonlySet<number>): Set<number> {
  return new Set([...foldedIndices].filter((index) => headingLevel(value[index]) !== null));
}

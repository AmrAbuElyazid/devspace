import type { Descendant, Path, TRange } from "platejs";
import { ElementApi, TextApi } from "platejs";

/** A single search hit, as a selectable range. */
export type NoteMatch = TRange;

/**
 * Every occurrence of `search`, as selectable ranges.
 *
 * This deliberately mirrors `decorateFindReplace` from `@platejs/find-replace`:
 * that plugin paints the highlights, this drives navigation and replace, and if
 * the two disagreed about what counts as a match then "next match" would jump
 * somewhere unhighlighted. Both join an element's text children before
 * searching, so a match spanning a bold run inside a sentence is still one
 * match, and both compare case-insensitively.
 */
export function findMatches(value: Descendant[], search: string): TRange[] {
  if (!search) return [];

  const needle = search.toLowerCase();
  const ranges: TRange[] = [];

  const walk = (nodes: Descendant[], path: Path): void => {
    nodes.forEach((node, index) => {
      const nodePath = [...path, index];

      if (!ElementApi.isElement(node)) return;

      if (node.children.every((child) => TextApi.isText(child))) {
        collect(node.children as { text: string }[], nodePath, needle, search.length, ranges);
        return;
      }

      walk(node.children as Descendant[], nodePath);
    });
  };

  walk(value, []);

  return ranges;
}

/**
 * Matches inside a single element, for the decoration pass.
 *
 * Shares `collect` with `findMatches` so the highlights and the match list are
 * the same computation rather than two that have to agree.
 */
export function matchesInElement(node: Descendant, path: Path, search: string): TRange[] {
  if (!search || !ElementApi.isElement(node)) return [];
  if (!node.children.every((child) => TextApi.isText(child))) return [];

  const ranges: TRange[] = [];
  collect(node.children as { text: string }[], path, search.toLowerCase(), search.length, ranges);
  return ranges;
}

/** Whether two ranges cover exactly the same span. */
export function isSameRange(a: TRange | null, b: TRange | null): boolean {
  if (!a || !b) return false;
  return (
    a.anchor.offset === b.anchor.offset &&
    a.focus.offset === b.focus.offset &&
    a.anchor.path.join() === b.anchor.path.join() &&
    a.focus.path.join() === b.focus.path.join()
  );
}

function collect(
  texts: { text: string }[],
  path: Path,
  needle: string,
  length: number,
  out: TRange[],
): void {
  const joined = texts.map((child) => child.text).join("");
  const haystack = joined.toLowerCase();

  let cursor = 0;
  const starts: number[] = [];
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    starts.push(found);
    // Non-overlapping, like the decorator.
    cursor = found + needle.length;
  }
  if (starts.length === 0) return;

  for (const start of starts) {
    const anchor = locate(texts, path, start);
    const focus = locate(texts, path, start + length);
    if (anchor && focus) out.push({ anchor, focus });
  }
}

/** Map an offset in the joined string back to a text child and offset. */
function locate(
  texts: { text: string }[],
  path: Path,
  offset: number,
): { offset: number; path: Path } | null {
  let remaining = offset;

  for (const [index, child] of texts.entries()) {
    if (remaining <= child.text.length) {
      return { offset: remaining, path: [...path, index] };
    }
    remaining -= child.text.length;
  }

  const last = texts.length - 1;
  return last >= 0 ? { offset: texts[last]!.text.length, path: [...path, last] } : null;
}

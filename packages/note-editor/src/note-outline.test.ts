import type { Value } from "platejs";
import { describe, expect, test } from "vitest";

import { hiddenBlockIndices, pruneFolds } from "./heading-fold";
import { noteOutline } from "./note-outline";
import { noteStats } from "./note-stats";

const h = (level: number, text: string) => ({ children: [{ text }], type: `h${level}` });
const p = (text: string) => ({ children: [{ text }], type: "p" });

const DOC = [
  h(1, "Title"),
  p("intro"),
  h(2, "Setup"),
  p("install"),
  h(3, "Prerequisites"),
  p("node"),
  h(2, "Usage"),
  p("run it"),
] as Value;

describe("noteOutline", () => {
  test("lists headings with their level and position", () => {
    expect(noteOutline(DOC)).toEqual([
      { id: "0", level: 1, path: 0, title: "Title" },
      { id: "2", level: 2, path: 2, title: "Setup" },
      { id: "4", level: 3, path: 4, title: "Prerequisites" },
      { id: "6", level: 2, path: 6, title: "Usage" },
    ]);
  });

  test("labels an empty heading rather than showing a blank row", () => {
    expect(noteOutline([h(2, "   ")] as Value)[0]?.title).toBe("Untitled section");
  });

  test("is empty for a note with no headings", () => {
    expect(noteOutline([p("just prose")] as Value)).toEqual([]);
  });
});

describe("hiddenBlockIndices", () => {
  test("a folded h2 hides its body and its subsections, stopping at the next h2", () => {
    expect([...hiddenBlockIndices(DOC, new Set([2]))]).toEqual([3, 4, 5]);
  });

  test("a folded h1 hides everything below it", () => {
    expect([...hiddenBlockIndices(DOC, new Set([0]))]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("the deepest heading hides only what follows it", () => {
    expect([...hiddenBlockIndices(DOC, new Set([4]))]).toEqual([5]);
  });

  test("nothing is hidden when nothing is folded", () => {
    expect(hiddenBlockIndices(DOC, new Set()).size).toBe(0);
  });

  test("a fold pointing at a paragraph is ignored", () => {
    expect(hiddenBlockIndices(DOC, new Set([1])).size).toBe(0);
  });

  test("overlapping folds union rather than conflict", () => {
    expect([...hiddenBlockIndices(DOC, new Set([0, 2]))].toSorted((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("pruneFolds", () => {
  test("keeps folds that still point at a heading", () => {
    expect([...pruneFolds(DOC, new Set([0, 2]))]).toEqual([0, 2]);
  });

  test("drops folds left pointing at prose or past the end", () => {
    expect([...pruneFolds(DOC, new Set([1, 99]))]).toEqual([]);
  });
});

describe("noteStats", () => {
  test("counts the text a reader sees", () => {
    expect(noteStats([p("one two three")] as Value)).toEqual({
      characters: 13,
      readingMinutes: 1,
      words: 3,
    });
  });

  test("an empty note has no reading time", () => {
    expect(noteStats([p("")] as Value)).toEqual({
      characters: 0,
      readingMinutes: 0,
      words: 0,
    });
  });

  test("rounds reading time up to whole minutes", () => {
    const long = Array.from({ length: 300 }, () => p("word")) as Value;
    expect(noteStats(long).readingMinutes).toBe(2);
  });

  test("collapses runs of whitespace instead of counting empty words", () => {
    expect(noteStats([p("a   b")] as Value).words).toBe(2);
  });
});

import type { Descendant } from "platejs";
import { describe, expect, test } from "vitest";

import { findMatches } from "./find-matches";

const p = (...children: object[]) => ({ children, type: "p" }) as Descendant;
const t = (text: string, marks: object = {}) => ({ text, ...marks });

describe("findMatches", () => {
  test("finds every occurrence in a paragraph", () => {
    const matches = findMatches([p(t("cat and cat"))], "cat");

    expect(matches).toEqual([
      { anchor: { offset: 0, path: [0, 0] }, focus: { offset: 3, path: [0, 0] } },
      { anchor: { offset: 8, path: [0, 0] }, focus: { offset: 11, path: [0, 0] } },
    ]);
  });

  test("is case insensitive, like the highlighter", () => {
    expect(findMatches([p(t("Cat CAT cat"))], "cat")).toHaveLength(3);
  });

  test("matches across a mark boundary, because the highlighter does", () => {
    // "hello" is split by a bold run; searching the joined text keeps it one match.
    const matches = findMatches([p(t("hel"), t("lo", { bold: true }))], "hello");

    expect(matches).toEqual([
      { anchor: { offset: 0, path: [0, 0] }, focus: { offset: 2, path: [0, 1] } },
    ]);
  });

  test("does not overlap matches", () => {
    expect(findMatches([p(t("aaaa"))], "aa")).toHaveLength(2);
  });

  test("descends into nested blocks", () => {
    const value = [
      {
        children: [{ children: [t("needle")], type: "p" }],
        type: "callout",
      },
    ] as Descendant[];

    expect(findMatches(value, "needle")).toEqual([
      { anchor: { offset: 0, path: [0, 0, 0] }, focus: { offset: 6, path: [0, 0, 0] } },
    ]);
  });

  test("an empty query matches nothing", () => {
    expect(findMatches([p(t("anything"))], "")).toEqual([]);
  });

  test("reports matches in document order across blocks", () => {
    const matches = findMatches([p(t("one hit")), p(t("another hit"))], "hit");

    expect(matches.map((match) => match.anchor.path)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });
});

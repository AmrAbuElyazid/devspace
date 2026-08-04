import { expect, test } from "vitest";

import { nextPeekVisibility, peekHotBand, peekPanelRect } from "./sidebar-peek-geometry";

const CONTENT = { x: 100, y: 200, width: 1200, height: 800 };
const TITLE_BAR = 38;

test("the panel floats clear of the window edges and the title bar", () => {
  const rect = peekPanelRect(CONTENT, TITLE_BAR, 264);

  expect(rect).toEqual({ x: 108, y: 238, width: 264, height: 754 });
});

test("the panel still clears the edge when the app draws no title bar", () => {
  expect(peekPanelRect(CONTENT, 0, 264).y).toBe(CONTENT.y + 8);
});

test("the hot band starts below the title bar, so the traffic lights stay reachable", () => {
  const band = peekHotBand(CONTENT, TITLE_BAR);

  expect(band).toEqual({ x: 100, y: 238, width: 10, height: 762 });
});

test("the cursor reaching the left edge opens the panel", () => {
  expect(
    nextPeekVisibility({
      open: false,
      cursor: { x: 102, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(true);
});

test("the cursor over the title bar does not open the panel", () => {
  expect(
    nextPeekVisibility({
      open: false,
      cursor: { x: 102, y: 210 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(false);
});

test("a cursor deeper into the window does not open the panel", () => {
  expect(
    nextPeekVisibility({
      open: false,
      cursor: { x: 140, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(false);
});

test("an open panel survives the gap between it and the window edge", () => {
  // The cursor arrived through x=100..108, which is outside the panel itself.
  expect(
    nextPeekVisibility({
      open: true,
      cursor: { x: 101, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(true);
});

test("an open panel tolerates the cursor drifting just past its edge", () => {
  expect(
    nextPeekVisibility({
      open: true,
      cursor: { x: 108 + 264 + 20, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(true);
});

test("an open panel closes once the cursor is clearly away", () => {
  expect(
    nextPeekVisibility({
      open: true,
      cursor: { x: 700, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(false);
});

test("an open panel closes when the cursor leaves the window entirely", () => {
  expect(
    nextPeekVisibility({
      open: true,
      cursor: { x: 40, y: 600 },
      content: CONTENT,
      titleBarHeight: TITLE_BAR,
      width: 264,
    }),
  ).toBe(false);
});

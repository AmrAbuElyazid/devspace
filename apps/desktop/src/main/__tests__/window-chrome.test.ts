import { test, expect } from "vitest";
import { getTrafficLightPosition } from "../window-chrome";
import {
  MAX_TITLE_BAR_HEIGHT,
  MIN_TITLE_BAR_HEIGHT,
  TITLE_BAR_HEIGHT_COMPACT,
  TITLE_BAR_HEIGHT_EXPANDED,
} from "../../shared/chrome";

test("centers the traffic lights inside the reported title bar", () => {
  expect(getTrafficLightPosition(TITLE_BAR_HEIGHT_EXPANDED)).toEqual({ x: 16, y: 18 });
  expect(getTrafficLightPosition(TITLE_BAR_HEIGHT_COMPACT)).toEqual({ x: 16, y: 10 });
});

test("clamps heights that would push the buttons off the title bar", () => {
  expect(getTrafficLightPosition(0).y).toBe(getTrafficLightPosition(MIN_TITLE_BAR_HEIGHT).y);
  expect(getTrafficLightPosition(500).y).toBe(getTrafficLightPosition(MAX_TITLE_BAR_HEIGHT).y);
});

test("falls back to the default height for a non-finite value", () => {
  expect(getTrafficLightPosition(Number.NaN)).toEqual(
    getTrafficLightPosition(TITLE_BAR_HEIGHT_EXPANDED),
  );
});

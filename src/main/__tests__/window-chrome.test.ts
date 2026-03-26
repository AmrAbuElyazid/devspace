import { test, expect } from "vitest";
import { getTrafficLightPosition } from "../window-chrome";

test("uses the original lower traffic lights position when the sidebar is expanded", () => {
  expect(getTrafficLightPosition(true)).toEqual({ x: 16, y: 18 });
});

test("uses a higher traffic lights position when the sidebar is collapsed", () => {
  expect(getTrafficLightPosition(false)).toEqual({ x: 16, y: 6 });
});

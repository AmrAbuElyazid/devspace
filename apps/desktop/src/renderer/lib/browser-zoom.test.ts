import { expect, test } from "vitest";
import { clampBrowserZoom } from "./browser-zoom";

test("clampBrowserZoom holds the zoom inside the range the toolbar offers", () => {
  expect(clampBrowserZoom(0.1)).toBe(0.25);
  expect(clampBrowserZoom(9)).toBe(3);
  expect(clampBrowserZoom(1.2000000000000002)).toBe(1.2);
});

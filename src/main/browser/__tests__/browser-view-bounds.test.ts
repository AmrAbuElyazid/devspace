import { test, expect } from "vitest";
import { findHostViewBounds, translateRendererBoundsToContentBounds } from "../browser-view-bounds";

test("translateRendererBoundsToContentBounds adds the renderer host view offset", () => {
  const translated = translateRendererBoundsToContentBounds(
    { x: 120, y: 180, width: 640, height: 480 },
    { x: 18, y: 52 },
  );

  expect(translated).toEqual({ x: 138, y: 232, width: 640, height: 480 });
});

test("findHostViewBounds returns the matching renderer host view origin", () => {
  const hostBounds = findHostViewBounds(
    {
      children: [
        {
          webContents: { id: 7 },
          getBounds: () => ({ x: 18, y: 52, width: 1182, height: 748 }),
        },
        {
          webContents: { id: 99 },
          getBounds: () => ({ x: 100, y: 200, width: 400, height: 300 }),
        },
      ],
    },
    7,
  );

  expect(hostBounds).toEqual({ x: 18, y: 52 });
});

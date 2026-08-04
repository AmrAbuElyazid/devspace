import { expect, test } from "vitest";

import {
  BROWSER_DEVICE_TOOLBAR_HEIGHT,
  BROWSER_VIEWPORT_MAX_AREA,
  BROWSER_VIEWPORT_MAX_DIMENSION,
  BROWSER_VIEWPORT_MIN_DIMENSION,
  BROWSER_VIEWPORT_RAIL_SIZE,
  browserViewportKey,
  clampBrowserViewportSize,
  parseBrowserViewportSetting,
  resizeBrowserViewport,
  resolveBrowserViewportLayout,
  resolveDeviceViewportArea,
  resolveRailResizeDelta,
  resolveResponsiveViewportSize,
} from "./browser-viewport";

const PANEL = { width: 1000, height: 800 };

test("fill mode hands the guest the whole panel divided by zoom", () => {
  const layout = resolveBrowserViewportLayout(PANEL, { kind: "fill" }, 2);

  expect(layout).toEqual({
    cssWidth: 500,
    cssHeight: 400,
    viewWidth: 1000,
    viewHeight: 800,
    zoomFactor: 2,
    fitScale: 1,
    fillsPanel: true,
  });
});

test("a device that fits is centered at its exact size", () => {
  const layout = resolveBrowserViewportLayout(PANEL, { kind: "device", width: 375, height: 667 });

  expect(layout.fitScale).toBe(1);
  expect(layout.viewWidth).toBe(375);
  expect(layout.viewHeight).toBe(667);
  expect(layout.zoomFactor).toBe(1);
  expect(layout.fillsPanel).toBe(false);
});

test("an oversized device is scaled down but still lays out at its CSS width", () => {
  // 1920 wide into a 1000px panel must shrink on screen...
  const layout = resolveBrowserViewportLayout(PANEL, { kind: "device", width: 1920, height: 1080 });

  expect(layout.fitScale).toBeLessThan(1);
  expect(layout.viewWidth).toBeLessThan(1920);

  // ...while the guest still believes it is 1920 wide, so media queries fire
  // at the breakpoints the device would actually hit.
  expect(layout.cssWidth).toBe(1920);
  expect(layout.viewWidth / layout.zoomFactor).toBeCloseTo(1920, 0);
});

test("the CSS width survives fit-scaling exactly at every zoom level", () => {
  for (const zoom of [0.5, 1, 1.25, 2, 3]) {
    const layout = resolveBrowserViewportLayout(
      PANEL,
      { kind: "device", width: 1440, height: 900 },
      zoom,
    );

    // Exact, because the zoom factor is derived from the rounded width.
    expect(layout.viewWidth / layout.zoomFactor).toBe(1440);
    // Height absorbs the rounding that width no longer carries. At heavy
    // fit-scaling one rounded device pixel is worth more than one CSS pixel,
    // so the drift is bounded at a pixel and a half rather than a half.
    expect(Math.abs(layout.viewHeight / layout.zoomFactor - 900)).toBeLessThan(1.5);
  }
});

test("the device area reserves room for the toolbar and rails", () => {
  expect(resolveDeviceViewportArea(PANEL)).toEqual({
    width: 1000 - BROWSER_VIEWPORT_RAIL_SIZE * 2,
    height: 800 - BROWSER_DEVICE_TOOLBAR_HEIGHT - BROWSER_VIEWPORT_RAIL_SIZE,
  });
});

test("sizes are clamped to the dimension bounds", () => {
  expect(clampBrowserViewportSize({ width: 10, height: 10 })).toEqual({
    width: BROWSER_VIEWPORT_MIN_DIMENSION,
    height: BROWSER_VIEWPORT_MIN_DIMENSION,
  });
  expect(clampBrowserViewportSize({ width: 99_999, height: 300 }).width).toBe(
    BROWSER_VIEWPORT_MAX_DIMENSION,
  );
});

test("sizes over the area budget give up the longer axis", () => {
  const clamped = clampBrowserViewportSize({ width: 4096, height: 4096 });

  expect(clamped.width * clamped.height).toBeLessThanOrEqual(BROWSER_VIEWPORT_MAX_AREA);
  expect(clamped.height).toBe(4096);
  expect(clamped.width).toBeLessThan(4096);
});

test("resizing east grows the width and leaves the height alone", () => {
  expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 100, y: 60 }, "east")).toEqual({
    width: 500,
    height: 800,
  });
});

test("resizing south grows the height and leaves the width alone", () => {
  expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 100, y: 60 }, "south")).toEqual({
    width: 400,
    height: 860,
  });
});

test("a corner drag moves both axes", () => {
  expect(
    resizeBrowserViewport({ width: 400, height: 800 }, { x: 100, y: 60 }, "southeast"),
  ).toEqual({ width: 500, height: 860 });
});

test("a locked aspect ratio drives the second axis from the first", () => {
  const resized = resizeBrowserViewport({ width: 400, height: 800 }, { x: 100, y: 0 }, "east", 0.5);

  expect(resized).toEqual({ width: 500, height: 1000 });
});

test("a centered frame grows by twice the pointer distance", () => {
  // The frame is 400 wide inside 980 of space, so both edges move outward.
  const delta = resolveRailResizeDelta(
    { width: 400, height: 800 },
    { x: 50, y: 0 },
    { width: 980, height: 758 },
    1,
    "east",
  );

  expect(delta.x).toBe(100);
});

test("dragging the west rail outward also grows the frame", () => {
  const delta = resolveRailResizeDelta(
    { width: 400, height: 800 },
    { x: -50, y: 0 },
    { width: 980, height: 758 },
    1,
    "west",
  );

  expect(delta.x).toBe(100);
});

test("an overflowing frame tracks the pointer one-to-one", () => {
  // Once wider than the panel the frame is no longer centered, so doubling
  // would make the edge run away from the cursor.
  const delta = resolveRailResizeDelta(
    { width: 2000, height: 800 },
    { x: 50, y: 0 },
    { width: 980, height: 758 },
    1,
    "east",
  );

  expect(delta.x).toBe(50);
});

test("rail deltas are expressed in CSS px, undoing the render scale", () => {
  const delta = resolveRailResizeDelta(
    { width: 2000, height: 800 },
    { x: 50, y: 0 },
    { width: 980, height: 758 },
    0.5,
    "east",
  );

  expect(delta.x).toBe(100);
});

test("the responsive size is the largest frame that needs no scaling", () => {
  const size = resolveResponsiveViewportSize(PANEL);
  const layout = resolveBrowserViewportLayout(PANEL, { kind: "device", ...size });

  expect(layout.fitScale).toBe(1);
});

test("viewport keys distinguish settings", () => {
  expect(browserViewportKey({ kind: "fill" })).toBe("fill");
  expect(browserViewportKey({ kind: "device", width: 375, height: 667 })).not.toBe(
    browserViewportKey({ kind: "device", width: 375, height: 668 }),
  );
});

test("a persisted fill viewport parses back to fill", () => {
  expect(parseBrowserViewportSetting({ kind: "fill" })).toEqual({ kind: "fill" });
});

test("a persisted device viewport round-trips, preset and all", () => {
  expect(
    parseBrowserViewportSetting({ kind: "device", width: 430, height: 932, presetId: "x" }),
  ).toEqual({ kind: "device", width: 430, height: 932, presetId: "x" });
});

test("corrupted dimensions fall back to fill rather than laying out NaN", () => {
  // Math.max(1, Math.round(NaN)) is NaN, which would reach setBounds.
  for (const bad of [
    { kind: "device", width: Number.NaN, height: 800 },
    { kind: "device", width: 400, height: Number.POSITIVE_INFINITY },
    { kind: "device", width: "400", height: 800 },
    { kind: "device" },
    { kind: "nonsense" },
    null,
    undefined,
    "fill",
  ]) {
    expect(parseBrowserViewportSetting(bad)).toEqual({ kind: "fill" });
  }
});

test("out-of-range persisted dimensions are clamped, not rejected", () => {
  const parsed = parseBrowserViewportSetting({ kind: "device", width: 5, height: 99_999 });

  expect(parsed).toEqual({
    kind: "device",
    width: BROWSER_VIEWPORT_MIN_DIMENSION,
    height: BROWSER_VIEWPORT_MAX_DIMENSION,
  });
});

/**
 * Geometry for the browser pane's responsive ("device") mode.
 *
 * The browser pane is a native `WebContentsView`, not a DOM element, so the
 * device frame cannot be produced by CSS-transforming the page. Instead the
 * renderer sizes the *placeholder* element that the native-view store measures,
 * and the view follows it. Everything here is the arithmetic that turns a
 * requested device size plus the available panel into that placeholder rect.
 *
 * The invariant that makes device mode useful: **the guest always lays out at
 * the requested CSS width**, even when the device is larger than the pane and
 * has to be scaled down to fit. A naive implementation shrinks the view and
 * lets the page reflow, which silently reports the wrong breakpoint — the one
 * thing a responsive-design tool must never do. We preserve it by pairing the
 * shrunken view bounds with a matching Electron zoom factor:
 *
 *     cssWidth = viewWidth / zoomFactor
 *              = (device.width x userZoom x fitScale) / (userZoom x fitScale)
 *              = device.width
 *
 * so the scale cancels out of the guest's own view of the world.
 */

export interface BrowserViewportSize {
  width: number;
  height: number;
}

export type BrowserViewportSetting =
  | { kind: "fill" }
  | { kind: "device"; width: number; height: number; presetId?: string };

/** Shared default, so panes without a stored viewport keep a stable identity. */
export const FILL_VIEWPORT: BrowserViewportSetting = Object.freeze({ kind: "fill" as const });

export interface BrowserViewportPreset extends BrowserViewportSize {
  id: string;
  label: string;
  group: "Phone" | "Tablet" | "Desktop";
}

/** Height of the device toolbar strip above the viewport, in px. */
export const BROWSER_DEVICE_TOOLBAR_HEIGHT = 32;
/** Thickness of the draggable rails around the viewport, in px. */
export const BROWSER_VIEWPORT_RAIL_SIZE = 10;

export const BROWSER_VIEWPORT_MIN_DIMENSION = 240;
export const BROWSER_VIEWPORT_MAX_DIMENSION = 4096;
/** Caps guest surface memory; roughly a 4K frame. */
export const BROWSER_VIEWPORT_MAX_AREA = 3840 * 2160;

export const BROWSER_VIEWPORT_PRESETS: readonly BrowserViewportPreset[] = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, group: "Phone" },
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, group: "Phone" },
  { id: "iphone-15-pro-max", label: "iPhone 15 Pro Max", width: 430, height: 932, group: "Phone" },
  { id: "pixel-8", label: "Pixel 8", width: 412, height: 915, group: "Phone" },
  { id: "ipad-mini", label: "iPad mini", width: 744, height: 1133, group: "Tablet" },
  { id: "ipad-pro-11", label: 'iPad Pro 11"', width: 834, height: 1194, group: "Tablet" },
  { id: "surface-pro", label: "Surface Pro", width: 912, height: 1368, group: "Tablet" },
  { id: "laptop", label: "Laptop", width: 1280, height: 800, group: "Desktop" },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, group: "Desktop" },
  { id: "desktop-hd", label: "Desktop HD", width: 1920, height: 1080, group: "Desktop" },
];

export type BrowserViewportResizeDirection = "east" | "west" | "south" | "southeast" | "southwest";

export interface BrowserViewportLayout {
  /** CSS size the guest lays out at. Invariant across fit-scaling. */
  cssWidth: number;
  cssHeight: number;
  /** On-screen footprint of the native view, in renderer px. */
  viewWidth: number;
  viewHeight: number;
  /** Zoom factor to hand Electron so `viewWidth / zoomFactor === cssWidth`. */
  zoomFactor: number;
  /** 1 when the device fits; below 1 when it had to be scaled down. */
  fitScale: number;
  /** True in fill mode, where there is no device frame to draw. */
  fillsPanel: boolean;
}

const normalizeZoom = (zoom: number): number => (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);

const clampDimension = (value: number): number =>
  Math.min(BROWSER_VIEWPORT_MAX_DIMENSION, Math.max(BROWSER_VIEWPORT_MIN_DIMENSION, value));

/**
 * Coerce a persisted viewport into something safe to lay out with.
 *
 * This value round-trips through workspace persistence, which spreads pane
 * objects verbatim rather than validating fields. Everything else in this file
 * clamps its inputs, but a stored `width: NaN` — from a corrupted file or an
 * older build — would flow straight into the layout, where `Math.max(1, NaN)`
 * is `NaN` and the pane hands NaN bounds to `setBounds`. Anything that is not a
 * well-formed device setting falls back to filling the pane.
 */
export function parseBrowserViewportSetting(value: unknown): BrowserViewportSetting {
  if (typeof value !== "object" || value === null) return FILL_VIEWPORT;

  const setting = value as Partial<Extract<BrowserViewportSetting, { kind: "device" }>>;
  if (setting.kind !== "device") return FILL_VIEWPORT;

  const { width, height } = setting;
  if (typeof width !== "number" || typeof height !== "number") return FILL_VIEWPORT;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return FILL_VIEWPORT;

  const clamped = clampBrowserViewportSize({ width, height });
  return {
    kind: "device",
    ...clamped,
    ...(typeof setting.presetId === "string" ? { presetId: setting.presetId } : {}),
  };
}

/** Stable identity for a setting, for use as a React key or drag guard. */
export function browserViewportKey(setting: BrowserViewportSetting): string {
  return setting.kind === "fill"
    ? "fill"
    : `device:${setting.width}x${setting.height}:${setting.presetId ?? ""}`;
}

/**
 * The space a centered device frame gets to live in, once the toolbar strip
 * and the surrounding drag rails have taken their share of the pane.
 */
export function resolveDeviceViewportArea(panel: BrowserViewportSize): BrowserViewportSize {
  return {
    width: Math.max(1, panel.width - BROWSER_VIEWPORT_RAIL_SIZE * 2),
    height: Math.max(1, panel.height - BROWSER_DEVICE_TOOLBAR_HEIGHT - BROWSER_VIEWPORT_RAIL_SIZE),
  };
}

export function resolveBrowserViewportLayout(
  panel: BrowserViewportSize,
  setting: BrowserViewportSetting,
  zoom = 1,
): BrowserViewportLayout {
  const panelWidth = Math.max(1, Math.round(panel.width));
  const panelHeight = Math.max(1, Math.round(panel.height));
  const userZoom = normalizeZoom(zoom);

  if (setting.kind === "fill") {
    return {
      // In fill mode the guest's CSS viewport is simply the pane divided by
      // the user's zoom — the normal browser behaviour.
      cssWidth: Math.max(1, Math.round(panelWidth / userZoom)),
      cssHeight: Math.max(1, Math.round(panelHeight / userZoom)),
      viewWidth: panelWidth,
      viewHeight: panelHeight,
      zoomFactor: userZoom,
      fitScale: 1,
      fillsPanel: true,
    };
  }

  const area = resolveDeviceViewportArea({ width: panelWidth, height: panelHeight });
  const renderedWidth = setting.width * userZoom;
  const renderedHeight = setting.height * userZoom;
  const fitScale = Math.min(1, area.width / renderedWidth, area.height / renderedHeight);
  const viewWidth = Math.max(1, Math.round(renderedWidth * fitScale));
  const viewHeight = Math.max(1, Math.round(renderedHeight * fitScale));

  return {
    cssWidth: setting.width,
    cssHeight: setting.height,
    viewWidth,
    viewHeight,
    // Derived from the *rounded* width rather than `userZoom * fitScale`, so
    // `viewWidth / zoomFactor` is exactly the requested width instead of being
    // off by whatever that rounding discarded. Only one axis can be exact
    // under a single zoom factor, and width is the one that decides which
    // media query fires — a device pinned to a 768px breakpoint must not land
    // on 767 because the frame was scaled to fit.
    zoomFactor: viewWidth / setting.width,
    fitScale,
    fillsPanel: false,
  };
}

/** Clamp a requested size into the dimension and total-area budget. */
export function clampBrowserViewportSize(size: BrowserViewportSize): BrowserViewportSize {
  let width = clampDimension(Math.round(size.width));
  let height = clampDimension(Math.round(size.height));

  if (width * height <= BROWSER_VIEWPORT_MAX_AREA) {
    return { width, height };
  }

  // Over budget: give up the larger axis first so the shape stays recognisable.
  if (width >= height) {
    width = Math.max(
      BROWSER_VIEWPORT_MIN_DIMENSION,
      Math.floor(BROWSER_VIEWPORT_MAX_AREA / height),
    );
  } else {
    height = Math.max(
      BROWSER_VIEWPORT_MIN_DIMENSION,
      Math.floor(BROWSER_VIEWPORT_MAX_AREA / width),
    );
  }

  return { width, height };
}

function resizeAtAspectRatio(
  desired: number,
  aspectRatio: number,
  axis: "width" | "height",
): BrowserViewportSize {
  const primary = clampDimension(Math.round(desired));
  const size =
    axis === "width"
      ? { width: primary, height: Math.round(primary / aspectRatio) }
      : { width: Math.round(primary * aspectRatio), height: primary };

  return clampBrowserViewportSize(size);
}

/**
 * Apply a pointer delta to a device size.
 *
 * `delta` is expressed in the direction of growth: positive means bigger,
 * whichever edge is being dragged. Callers translate raw pointer movement
 * into that convention via {@link resolveRailResizeDelta}.
 */
export function resizeBrowserViewport(
  start: BrowserViewportSize,
  delta: { x: number; y: number },
  direction: BrowserViewportResizeDirection,
  aspectRatio?: number | null,
): BrowserViewportSize {
  const controlsWidth = direction.includes("east") || direction.includes("west");
  const controlsHeight = direction.includes("south");
  const desiredWidth = controlsWidth ? start.width + delta.x : start.width;
  const desiredHeight = controlsHeight ? start.height + delta.y : start.height;

  if (aspectRatio !== undefined && aspectRatio !== null && aspectRatio > 0) {
    // A corner drag can move both axes; follow whichever moved proportionally
    // more so the frame tracks the pointer rather than fighting it.
    const axis =
      controlsWidth && !controlsHeight
        ? "width"
        : controlsHeight && !controlsWidth
          ? "height"
          : Math.abs(desiredWidth - start.width) / start.width >=
              Math.abs(desiredHeight - start.height) / start.height
            ? "width"
            : "height";

    return resizeAtAspectRatio(axis === "width" ? desiredWidth : desiredHeight, aspectRatio, axis);
  }

  return clampBrowserViewportSize({ width: desiredWidth, height: desiredHeight });
}

/**
 * Convert raw pointer movement on a rail into a growth delta in CSS px.
 *
 * The device frame is centered, so dragging one edge outward moves the
 * opposite edge too and the frame grows by twice the pointer distance. Once
 * the frame is larger than the panel it stops being centered — it is pinned to
 * the top-left and clipped — and from then on the edge tracks the pointer 1:1.
 */
export function resolveRailResizeDelta(
  startSize: BrowserViewportSize,
  pointerDelta: { x: number; y: number },
  available: BrowserViewportSize,
  renderScale: number,
  direction: BrowserViewportResizeDirection,
): { x: number; y: number } {
  const scale = normalizeZoom(renderScale);

  const axis = (
    startExtent: number,
    pointer: number,
    availableExtent: number,
    inverted: boolean,
  ): number => {
    const rendered = startExtent * scale;
    const travel = inverted ? -pointer : pointer;
    // Centered while the frame fits; 1:1 once it overflows the panel.
    const growth = rendered < availableExtent ? travel * 2 : travel;
    return growth / scale;
  };

  return {
    x: direction.includes("east")
      ? axis(startSize.width, pointerDelta.x, available.width, false)
      : direction.includes("west")
        ? axis(startSize.width, pointerDelta.x, available.width, true)
        : 0,
    y: direction.includes("south")
      ? axis(startSize.height, pointerDelta.y, available.height, false)
      : 0,
  };
}

/** The largest device frame that fits the panel without any fit-scaling. */
export function resolveResponsiveViewportSize(
  panel: BrowserViewportSize,
  zoom = 1,
): BrowserViewportSize {
  const area = resolveDeviceViewportArea(panel);
  const userZoom = normalizeZoom(zoom);

  return clampBrowserViewportSize({
    width: area.width / userZoom,
    height: area.height / userZoom,
  });
}

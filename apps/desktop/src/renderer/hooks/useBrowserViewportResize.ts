import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import {
  browserViewportKey,
  resizeBrowserViewport,
  resolveDeviceViewportArea,
  resolveRailResizeDelta,
  type BrowserViewportResizeDirection,
  type BrowserViewportSetting,
  type BrowserViewportSize,
} from "../lib/browser-viewport";

/**
 * Keyboard resizing commits on a trailing debounce so a held arrow key reads
 * as one resize in undo/persistence rather than one per repeat event.
 */
const KEYBOARD_COMMIT_DELAY_MS = 150;
const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_COARSE = 50;

/**
 * Declared inline rather than as a named interface: the hook's return type
 * mentions it, and a local named type there trips TS4058 at the call site
 * while an exported one is dead weight nothing imports.
 */
type ViewportDrag = BrowserViewportSize & {
  /** Guards against a drag outliving the setting it started from. */
  sourceKey: string;
  direction: BrowserViewportResizeDirection;
};

interface UseBrowserViewportResizeOptions {
  viewport: BrowserViewportSetting;
  /** Full pane content rect the device frame is laid out inside. */
  panel: BrowserViewportSize;
  /** Presentation scale currently applied to the frame; drags divide it out. */
  renderScale: number;
  aspectRatio: number | null;
  onCommit: (next: BrowserViewportSetting) => void;
}

/**
 * Pointer and keyboard resizing for the device frame.
 *
 * While a drag is live the caller renders `effectiveViewport` — a local,
 * uncommitted size — so the frame tracks the pointer without a store write per
 * pointermove. Only the released size is committed.
 */
export function useBrowserViewportResize({
  viewport,
  panel,
  renderScale,
  aspectRatio,
  onCommit,
}: UseBrowserViewportResizeOptions) {
  const [drag, setDrag] = useState<ViewportDrag | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const keyboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardDragRef = useRef<ViewportDrag | null>(null);

  const sourceKey = browserViewportKey(viewport);
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;

  // A drag from a previous setting must not paint over the current one.
  const activeDrag = drag?.sourceKey === sourceKey ? drag : null;
  const effectiveViewport: BrowserViewportSetting = activeDrag
    ? { kind: "device", width: activeDrag.width, height: activeDrag.height }
    : viewport;

  // The handlers below depend on these primitives rather than on
  // `effectiveViewport`, which is a fresh object on every render and would
  // rebuild both callbacks (and so re-bind their listeners) each time.
  const isDeviceMode = effectiveViewport.kind === "device";
  const deviceWidth = effectiveViewport.kind === "device" ? effectiveViewport.width : 0;
  const deviceHeight = effectiveViewport.kind === "device" ? effectiveViewport.height : 0;

  const clearKeyboardTimer = useCallback(() => {
    if (keyboardTimerRef.current !== null) {
      clearTimeout(keyboardTimerRef.current);
      keyboardTimerRef.current = null;
    }
    keyboardDragRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      if (keyboardTimerRef.current !== null) clearTimeout(keyboardTimerRef.current);
    },
    [],
  );

  // Drop a pending keyboard commit when the setting changes underneath it, or
  // releasing the key would overwrite the newer selection with a stale size.
  useEffect(() => {
    const pending = keyboardDragRef.current;
    if (pending && pending.sourceKey !== sourceKey) {
      clearKeyboardTimer();
    }
  }, [clearKeyboardTimer, sourceKey]);

  const handleResizeKeyDown = useCallback(
    (direction: BrowserViewportResizeDirection, event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isDeviceMode) return;

      const controlsWidth = direction.includes("east") || direction.includes("west");
      const controlsHeight = direction.includes("south");
      const step = event.shiftKey ? KEYBOARD_STEP_COARSE : KEYBOARD_STEP;

      const delta =
        event.key === "ArrowLeft" && controlsWidth
          ? { x: -step, y: 0 }
          : event.key === "ArrowRight" && controlsWidth
            ? { x: step, y: 0 }
            : event.key === "ArrowUp" && controlsHeight
              ? { x: 0, y: -step }
              : event.key === "ArrowDown" && controlsHeight
                ? { x: 0, y: step }
                : null;
      if (!delta) return;

      event.preventDefault();
      event.stopPropagation();

      // Accumulate from the pending size so repeats compound.
      const pending = keyboardDragRef.current;
      const base =
        pending?.sourceKey === sourceKey ? pending : { width: deviceWidth, height: deviceHeight };
      const next = resizeBrowserViewport(base, delta, direction, aspectRatio);
      if (next.width === base.width && next.height === base.height) return;

      const nextDrag: ViewportDrag = { sourceKey, direction, ...next };
      keyboardDragRef.current = nextDrag;
      setDrag(nextDrag);

      if (keyboardTimerRef.current !== null) clearTimeout(keyboardTimerRef.current);
      keyboardTimerRef.current = setTimeout(() => {
        keyboardTimerRef.current = null;
        const latest = keyboardDragRef.current;
        keyboardDragRef.current = null;
        if (!latest || latest.sourceKey !== sourceKeyRef.current) return;
        onCommit({ kind: "device", width: latest.width, height: latest.height });
        setDrag(null);
      }, KEYBOARD_COMMIT_DELAY_MS);
    },
    [aspectRatio, deviceHeight, deviceWidth, isDeviceMode, onCommit, sourceKey],
  );

  const handleResizePointerDown = useCallback(
    (direction: BrowserViewportResizeDirection, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isDeviceMode) return;

      event.preventDefault();
      event.stopPropagation();
      clearKeyboardTimer();
      cleanupRef.current?.();

      const pointerId = event.pointerId;
      const target = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      const start = { width: deviceWidth, height: deviceHeight };
      const available = resolveDeviceViewportArea(panel);
      let latest = start;

      setDrag({ sourceKey, direction, ...start });

      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Window listeners below keep the drag working without capture.
      }

      const move = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) return;
        if (sourceKeyRef.current !== sourceKey) {
          cleanup();
          setDrag(null);
          return;
        }

        moveEvent.preventDefault();
        const growth = resolveRailResizeDelta(
          start,
          { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY },
          available,
          renderScale,
          direction,
        );
        latest = resizeBrowserViewport(start, growth, direction, aspectRatio);
        setDrag({ sourceKey, direction, ...latest });
      };

      function cleanup(): void {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        cleanupRef.current = null;
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Capture may already have been released on pointerup.
        }
      }

      function finish(upEvent: PointerEvent): void {
        if (upEvent.pointerId !== pointerId) return;
        cleanup();

        const unchanged = latest.width === start.width && latest.height === start.height;
        if (sourceKeyRef.current !== sourceKey || unchanged) {
          setDrag(null);
          return;
        }

        onCommit({ kind: "device", width: latest.width, height: latest.height });
        setDrag(null);
      }

      function cancel(cancelEvent: PointerEvent): void {
        if (cancelEvent.pointerId !== pointerId) return;
        cleanup();
        setDrag(null);
      }

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
    },
    [
      aspectRatio,
      clearKeyboardTimer,
      deviceHeight,
      deviceWidth,
      isDeviceMode,
      onCommit,
      panel,
      renderScale,
      sourceKey,
    ],
  );

  return { activeDrag, effectiveViewport, handleResizeKeyDown, handleResizePointerDown };
}

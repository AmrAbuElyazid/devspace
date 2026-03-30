import { test, expect } from "vitest";
import { installWindowZoomReset, resetWindowZoom } from "../window-zoom";

test("resetWindowZoom forces the shell webContents zoom factor to one", () => {
  const calls: Array<[string, ...number[]]> = [];

  resetWindowZoom({
    setZoomFactor: (factor) => {
      calls.push(["setZoomFactor", factor]);
    },
    setVisualZoomLevelLimits: (minimum, maximum) => {
      calls.push(["setVisualZoomLevelLimits", minimum, maximum]);
    },
  });

  expect(calls).toEqual([
    ["setZoomFactor", 1],
    ["setVisualZoomLevelLimits", 1, 1],
  ]);
});

test("installWindowZoomReset resets zoom after main window load completes", () => {
  const listeners = new Map<string, () => void>();
  const calls: Array<[string, ...number[]]> = [];

  installWindowZoomReset({
    on: (event, listener) => {
      listeners.set(event, listener);
    },
    setZoomFactor: (factor) => {
      calls.push(["setZoomFactor", factor]);
    },
    setVisualZoomLevelLimits: (minimum, maximum) => {
      calls.push(["setVisualZoomLevelLimits", minimum, maximum]);
    },
  });

  const listener = listeners.get("did-finish-load");
  expect(listener).toBeTruthy();
  listener?.();

  expect(calls).toEqual([
    ["setZoomFactor", 1],
    ["setVisualZoomLevelLimits", 1, 1],
  ]);
});

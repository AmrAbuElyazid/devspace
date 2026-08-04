import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { SidebarPeekConfig } from "../shared/sidebar-peek";
import type { Rect } from "./sidebar-peek-geometry";
import { SidebarPeekWatcher } from "./sidebar-peek-watcher";

const CONTENT: Rect = { x: 0, y: 0, width: 1200, height: 800 };
const EDGE = { x: 3, y: 400 };
const MIDDLE = { x: 700, y: 400 };

function config(overrides: Partial<SidebarPeekConfig> = {}): SidebarPeekConfig {
  return {
    enabled: true,
    titleBarHeight: 38,
    snapshot: { dark: true, compact: false, rows: [] },
    ...overrides,
  };
}

function setup(): {
  watcher: SidebarPeekWatcher;
  cursor: { point: { x: number; y: number } };
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
} {
  const cursor = { point: MIDDLE };
  const show = vi.fn();
  const hide = vi.fn();
  const watcher = new SidebarPeekWatcher({
    getContentBounds: () => CONTENT,
    getCursorPoint: () => cursor.point,
    isWindowFocused: () => true,
    show,
    hide,
  });
  return { watcher, cursor, show, hide };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("does nothing until the renderer says the sidebar is collapsed", () => {
  const { watcher, cursor, show } = setup();
  cursor.point = EDGE;

  watcher.tick();
  expect(show).not.toHaveBeenCalled();

  watcher.setConfig(config());
  watcher.tick();
  expect(show).toHaveBeenCalledTimes(1);
});

test("opens at the panel rect when the cursor reaches the edge", () => {
  const { watcher, cursor, show } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;

  watcher.tick();

  expect(show).toHaveBeenCalledWith({ x: 8, y: 38, width: 264, height: 754 }, expect.anything());
});

test("closes once, when the cursor leaves", () => {
  const { watcher, cursor, hide } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;
  watcher.tick();

  cursor.point = MIDDLE;
  watcher.tick();
  watcher.tick();

  expect(hide).toHaveBeenCalledTimes(1);
});

test("keeps pushing while open, so a rename or a window move lands", () => {
  const { watcher, cursor, show } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;

  watcher.tick();
  watcher.tick();

  expect(show).toHaveBeenCalledTimes(2);
});

test("the sidebar being opened closes the panel", () => {
  const { watcher, cursor, hide } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;
  watcher.tick();

  watcher.setConfig(config({ enabled: false }));

  expect(hide).toHaveBeenCalledTimes(1);
});

test("blurring the window closes the panel and stops the polling", () => {
  const { watcher, cursor, show, hide } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;
  watcher.tick();
  show.mockClear();

  watcher.setWindowFocused(false);
  expect(hide).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1_000);
  expect(show).not.toHaveBeenCalled();
});

test("a menu taking the surface suspends the panel until it is done", () => {
  const { watcher, cursor, show, hide } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;
  watcher.tick();
  show.mockClear();

  watcher.suspend();
  expect(hide).toHaveBeenCalledTimes(1);
  watcher.tick();
  expect(show).not.toHaveBeenCalled();

  watcher.resume();
  watcher.tick();
  expect(show).toHaveBeenCalledTimes(1);
});

test("dismissing after a click does not immediately reopen", () => {
  const { watcher, cursor, show, hide } = setup();
  watcher.setConfig(config());
  cursor.point = EDGE;
  watcher.tick();

  // Clicking a row leaves the cursor inside the panel, which is outside the
  // narrow band that opens it — so it stays shut until the user goes back.
  cursor.point = { x: 150, y: 400 };
  watcher.dismiss();
  expect(hide).toHaveBeenCalledTimes(1);
  show.mockClear();

  watcher.tick();
  expect(show).not.toHaveBeenCalled();
});

test("polling starts on its own once the sidebar collapses", () => {
  const { watcher, cursor, show } = setup();
  cursor.point = EDGE;
  watcher.setConfig(config());

  vi.advanceTimersByTime(200);

  expect(show).toHaveBeenCalled();
});

test("disposing stops the timer", () => {
  const { watcher, cursor, show } = setup();
  cursor.point = EDGE;
  watcher.setConfig(config());
  watcher.dispose();
  show.mockClear();

  vi.advanceTimersByTime(1_000);

  expect(show).not.toHaveBeenCalled();
});

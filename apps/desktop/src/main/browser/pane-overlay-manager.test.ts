import { beforeEach, expect, test, vi } from "vitest";

import { PaneOverlayManager } from "./pane-overlay-manager";
import { SIDEBAR_PEEK_ANIMATION_MS } from "../../shared/sidebar-peek";
import { isOverlayMenuRequest } from "../../shared/overlay";

const REQUEST = {
  anchor: { x: 10, y: 20, width: 30, height: 40 },
  items: [{ id: "a", label: "A" }],
};

function createHarness() {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const webContents = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
    once: vi.fn(),
  };
  const surface = {
    webContents,
    isDestroyed: () => false,
    isVisible: () => true,
    showInactive: vi.fn(),
    moveTop: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    setBounds: vi.fn(),
    setFocusable: vi.fn(),
  };
  const window = {
    isDestroyed: () => false,
    getContentBounds: () => ({ x: 100, y: 50, width: 1200, height: 800 }),
    focus: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };

  const manager = new PaneOverlayManager({
    getWindow: () => window as never,
    createSurface: () => surface as never,
    // The real loader is async; readiness is signalled over IPC instead.
    loadOverlay: () => {},
  });

  return { manager, surface, webContents, window, sent };
}

/** Token of the nth posted menu; throws rather than silently passing undefined. */
function tokenAt(sent: Array<{ payload: unknown }>, index: number): number {
  const entry = sent.at(index);
  if (!entry) throw new Error(`no menu posted at index ${index}`);
  return (entry.payload as { token: number }).token;
}

let harness: ReturnType<typeof createHarness>;

beforeEach(() => {
  harness = createHarness();
});

test("the surface is fitted to the parent and raised without stealing focus first", async () => {
  const { manager, surface, sent } = harness;

  void manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  // Covers the parent's content rect, so renderer coordinates map straight
  // through to the surface without translation.
  expect(surface.setBounds).toHaveBeenCalledWith({ x: 100, y: 50, width: 1200, height: 800 });
  // Shown inactive then raised: a surface shown while another app is frontmost
  // can otherwise sit below its own parent.
  expect(surface.showInactive).toHaveBeenCalled();
  expect(surface.moveTop).toHaveBeenCalled();
  // A menu owns the keyboard, or Escape and the arrows never reach it.
  expect(surface.focus).toHaveBeenCalled();
  expect(sent).toHaveLength(1);
});

test("a menu is only posted once the overlay reports it is listening", async () => {
  const { manager, sent } = harness;

  const pending = manager.showMenu(REQUEST);
  await Promise.resolve();
  // did-finish-load fires before React subscribes, so nothing may be sent yet.
  expect(sent).toHaveLength(0);

  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  expect(sent).toHaveLength(1);
  expect(sent[0]?.channel).toBe("overlay:menu");
  manager.resolveMenu(tokenAt(sent, 0), "a");
  await expect(pending).resolves.toBe("a");
});

test("choosing an item resolves and hides the overlay", async () => {
  const { manager, surface, window, sent } = harness;

  const pending = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  const token = tokenAt(sent, 0);
  manager.resolveMenu(token, "a");

  await expect(pending).resolves.toBe("a");
  expect(surface.hide).toHaveBeenCalled();
  // Focus goes back to the parent, or it stays inert until clicked.
  expect(window.focus).toHaveBeenCalled();
});

test("a dismissal resolves with null", async () => {
  const { manager, sent } = harness;

  const pending = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  manager.resolveMenu(tokenAt(sent, 0), null);

  await expect(pending).resolves.toBeNull();
});

test("a stale token is ignored", async () => {
  const { manager, sent } = harness;

  const pending = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  const token = tokenAt(sent, 0);
  manager.resolveMenu(token + 99, "a");

  let settled = false;
  void pending.then(() => (settled = true));
  await Promise.resolve();
  expect(settled).toBe(false);

  manager.resolveMenu(token, "a");
  await expect(pending).resolves.toBe("a");
});

test("a second menu supersedes the first rather than leaving it hanging", async () => {
  const { manager, sent } = harness;

  const first = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  const second = manager.showMenu(REQUEST);
  await expect(first).resolves.toBeNull();

  await Promise.resolve();
  await Promise.resolve();
  manager.resolveMenu(tokenAt(sent, -1), "a");
  await expect(second).resolves.toBe("a");
});

test("the surface is raised on each open so it stays topmost", async () => {
  const { manager, surface, sent } = harness;

  const first = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();
  manager.resolveMenu(tokenAt(sent, 0), null);
  await first;

  const second = manager.showMenu(REQUEST);
  await Promise.resolve();
  await Promise.resolve();

  // Another app taking focus between opens can drop it behind the parent.
  expect(surface.moveTop).toHaveBeenCalledTimes(2);
  manager.resolveMenu(tokenAt(sent, -1), null);
  await second;
});

test("malformed requests are rejected before reaching the overlay", () => {
  expect(isOverlayMenuRequest(REQUEST)).toBe(true);
  expect(isOverlayMenuRequest(null)).toBe(false);
  expect(isOverlayMenuRequest({ anchor: REQUEST.anchor, items: [] })).toBe(false);
  expect(isOverlayMenuRequest({ items: REQUEST.items })).toBe(false);
  expect(isOverlayMenuRequest({ anchor: { x: 1, y: 2, width: 3 }, items: REQUEST.items })).toBe(
    false,
  );
  expect(isOverlayMenuRequest({ anchor: REQUEST.anchor, items: [{ id: 1, label: "x" }] })).toBe(
    false,
  );
});

const PEEK_RECT = { x: 8, y: 38, width: 264, height: 754 };
const PEEK = { dark: true, compact: false, width: 264, sections: [] };

test("the peek panel is shown non-focusable, at its own rect", async () => {
  const { manager, surface, sent } = harness;

  const shown = manager.showPeek(PEEK_RECT, PEEK);
  manager.handleOverlayReady();
  await shown;

  expect(surface.setBounds).toHaveBeenCalledWith(PEEK_RECT);
  // Non-focusable is what keeps a click on a row from taking the keyboard away
  // from the terminal underneath.
  expect(surface.setFocusable).toHaveBeenCalledWith(false);
  expect(surface.focus).not.toHaveBeenCalled();
  expect(sent.at(-1)).toEqual({ channel: "overlay:peek", payload: PEEK });
});

test("a repeat push with nothing new does not resend or re-place", async () => {
  const { manager, surface, sent } = harness;
  const shown = manager.showPeek(PEEK_RECT, PEEK);
  manager.handleOverlayReady();
  await shown;
  surface.setBounds.mockClear();
  const before = sent.length;

  await manager.showPeek(PEEK_RECT, PEEK);

  expect(surface.setBounds).not.toHaveBeenCalled();
  expect(sent).toHaveLength(before);
});

test("a moved window re-places the open panel", async () => {
  const { manager, surface } = harness;
  const shown = manager.showPeek(PEEK_RECT, PEEK);
  manager.handleOverlayReady();
  await shown;
  surface.setBounds.mockClear();

  await manager.showPeek({ ...PEEK_RECT, x: 400 }, PEEK);

  expect(surface.setBounds).toHaveBeenCalledWith({ ...PEEK_RECT, x: 400 });
});

test("hiding the panel lets it slide out before the window goes", async () => {
  vi.useFakeTimers();
  try {
    const { manager, surface, window, sent } = harness;
    const shown = manager.showPeek(PEEK_RECT, PEEK);
    manager.handleOverlayReady();
    await shown;

    manager.hidePeek();

    expect(sent.at(-1)).toEqual({ channel: "overlay:peek", payload: null });
    // Still up, or the panel would vanish instead of leaving.
    expect(surface.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SIDEBAR_PEEK_ANIMATION_MS + 1);
    expect(surface.hide).toHaveBeenCalled();
    // One of the ways in here is the parent's own blur. Taking focus would pull
    // the app back in front of whatever the user had just switched to — and the
    // panel is non-focusable, so it has no keyboard to hand back anyway.
    expect(window.focus).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("coming straight back cancels the exit instead of hiding mid-slide", async () => {
  vi.useFakeTimers();
  try {
    const { manager, surface } = harness;
    const shown = manager.showPeek(PEEK_RECT, PEEK);
    manager.handleOverlayReady();
    await shown;

    manager.hidePeek();
    await manager.showPeek(PEEK_RECT, PEEK);
    vi.advanceTimersByTime(SIDEBAR_PEEK_ANIMATION_MS * 4);

    expect(surface.hide).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("a hide during the overlay's first load cancels the show it raced", async () => {
  const { manager, surface, sent } = harness;

  // The first peek of a session is what creates the surface, so this show is
  // parked until the overlay renderer mounts. The cursor moves on meanwhile.
  const shown = manager.showPeek(PEEK_RECT, PEEK);
  manager.hidePeek();
  manager.handleOverlayReady();
  await shown;

  expect(surface.showInactive).not.toHaveBeenCalled();
  expect(sent.filter((entry) => entry.channel === "overlay:peek")).toHaveLength(0);
});

test("a cancelled show does not stop the next one", async () => {
  const { manager, surface } = harness;
  const abandoned = manager.showPeek(PEEK_RECT, PEEK);
  manager.hidePeek();
  manager.handleOverlayReady();
  await abandoned;

  await manager.showPeek(PEEK_RECT, PEEK);

  expect(surface.showInactive).toHaveBeenCalledTimes(1);
});

test("a menu takes the surface from the panel", async () => {
  const { manager, surface, sent } = harness;
  const shownPeek = manager.showPeek(PEEK_RECT, PEEK);
  manager.handleOverlayReady();
  await shownPeek;

  const menu = manager.showMenu(REQUEST);
  await Promise.resolve();

  expect(sent.some((entry) => entry.channel === "overlay:peek" && entry.payload === null)).toBe(
    true,
  );
  expect(surface.setFocusable).toHaveBeenLastCalledWith(true);
  manager.resolveMenu(tokenAt(sent, -1), "a");
  await expect(menu).resolves.toBe("a");
});

test("the panel does not reopen over a menu that is still up", async () => {
  const { manager, sent } = harness;
  const menu = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  const before = sent.length;

  await manager.showPeek(PEEK_RECT, PEEK);

  expect(sent).toHaveLength(before);
  manager.resolveMenu(tokenAt(sent, -1), null);
  await menu;
});

test("closing a menu the parent never had focus for leaves the app in the background", async () => {
  // The user opened a menu, then switched apps while it was up. Handing focus
  // back on close would run the parent window's Focus(true) — activating
  // Devspace and raising it over whatever they had moved on to.
  const { manager, window, sent } = harness;
  (window as unknown as { isFocused: () => boolean }).isFocused = () => false;

  const pending = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  manager.resolveMenu(tokenAt(sent, 0), null);
  await expect(pending).resolves.toBe(null);

  expect(window.focus).not.toHaveBeenCalled();
});

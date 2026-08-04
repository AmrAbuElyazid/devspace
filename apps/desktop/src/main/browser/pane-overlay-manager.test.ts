import { beforeEach, expect, test, vi } from "vitest";

import { PaneOverlayManager } from "./pane-overlay-manager";
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
    focus: vi.fn(),
    close: vi.fn(),
    once: vi.fn(),
  };
  const view = {
    webContents,
    setBackgroundColor: vi.fn(),
    setVisible: vi.fn(),
    setBounds: vi.fn(),
  };
  const contentView = { addChildView: vi.fn(), removeChildView: vi.fn() };
  const window = { getContentSize: () => [1200, 800], contentView };

  const manager = new PaneOverlayManager({
    getWindow: () => window as never,
    createView: () => view as never,
    // The real loader is async; readiness is signalled over IPC instead.
    loadOverlay: () => {},
  });

  return { manager, view, webContents, contentView, sent };
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

test("the overlay view is created transparent and hidden", async () => {
  const { manager, view } = harness;

  void manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();

  // WebContentsView defaults to opaque white; without this it is a solid sheet.
  expect(view.setBackgroundColor).toHaveBeenCalledWith("#00000000");
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
  const { manager, view, sent } = harness;

  const pending = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();

  const token = tokenAt(sent, 0);
  manager.resolveMenu(token, "a");

  await expect(pending).resolves.toBe("a");
  expect(view.setVisible).toHaveBeenLastCalledWith(false);
  // Parked at zero size so it stops swallowing the pane's mouse input.
  expect(view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 });
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

test("the overlay is re-added on each open so it stays topmost", async () => {
  const { manager, contentView, sent } = harness;

  const first = manager.showMenu(REQUEST);
  manager.handleOverlayReady();
  await Promise.resolve();
  await Promise.resolve();
  manager.resolveMenu(tokenAt(sent, 0), null);
  await first;

  const second = manager.showMenu(REQUEST);
  await Promise.resolve();
  await Promise.resolve();

  // Panes opened after the overlay would otherwise stack above it.
  expect(contentView.addChildView).toHaveBeenCalledTimes(2);
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

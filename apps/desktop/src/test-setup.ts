/**
 * Vitest global setup — provides minimal browser API stubs so renderer
 * code (e.g. workspace-store) doesn't log warnings during unit tests.
 */

// Stub localStorage — the workspace store reads/writes persisted state here.
// Without this, every test that imports the store logs:
//   "localStorage is not defined"
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

// Stub ResizeObserver — jsdom does not implement it, and several renderer
// modules (native-view-store, the browser pane's device frame) construct one on
// mount. jsdom never lays anything out, so a recording no-op is the honest
// stand-in: tests that care about measurement drive it directly instead.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// Stub Element.getAnimations — also absent from jsdom. base-ui's ScrollArea
// polls it from a timer to decide when a scroll animation has settled, which
// only becomes reachable once ResizeObserver above exists, so the two stubs
// have to travel together.
function noAnimations(): Animation[] {
  return [];
}

if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = noAnimations;
}

// Stub PointerEvent — jsdom only implements MouseEvent, but base-ui drives its
// menus, selects and popovers off pointer events, so a test that opens one has
// no way to dispatch the event that would open it.
// Guarded on MouseEvent too: this file also runs for node-environment tests,
// where there is no DOM to subclass.
if (typeof globalThis.PointerEvent === "undefined" && typeof MouseEvent !== "undefined") {
  class StubPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  globalThis.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent;
}

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) {
    return;
  }
  return originalEmitWarning(warning as string, ...(args as [string?, string?, string?]));
}) as typeof process.emitWarning;

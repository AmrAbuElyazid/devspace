import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { DevServerPorts } from "../../shared/dev-server";
import type { TmuxPaneProcess } from "../managed-tmux";
import {
  DevServerScanner,
  PORT_SCAN_BURST_MS,
  PORT_SCAN_IDLE_TICKS,
  type DevServerScannerDeps,
} from "./dev-server-scanner";

const LAST_BURST_MS = PORT_SCAN_BURST_MS[PORT_SCAN_BURST_MS.length - 1] ?? 0;

function pane(sessionId: string, pid: number, command: string): TmuxPaneProcess {
  return { sessionId, pid, command };
}

function setup(overrides: Partial<DevServerScannerDeps> = {}): {
  scanner: DevServerScanner;
  emitted: DevServerPorts[][];
  deps: {
    listPaneProcesses: ReturnType<typeof vi.fn>;
    readProcessTable: ReturnType<typeof vi.fn>;
    readListeners: ReturnType<typeof vi.fn>;
  };
} {
  const emitted: DevServerPorts[][] = [];
  const deps = {
    listPaneProcesses: vi.fn(async () => [pane("a", 100, "zsh")]),
    readProcessTable: vi.fn(async () => "100 1\n"),
    readListeners: vi.fn(async () => ""),
  };
  const scanner = new DevServerScanner({
    ...deps,
    emit: (ports) => emitted.push(ports),
    ...overrides,
  });
  return { scanner, emitted, deps };
}

/** Runs the burst timers and lets each sweep's awaited probes settle. */
async function drainBurst(): Promise<void> {
  await vi.advanceTimersByTimeAsync(LAST_BURST_MS + 1);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("the first poll sweeps, because nothing was known before it", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);

  await scanner.poll();
  await drainBurst();

  expect(deps.readProcessTable).toHaveBeenCalled();
});

test("a poll that finds nothing changed does not touch the process table", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);

  await scanner.poll();
  await drainBurst();
  deps.readProcessTable.mockClear();

  await scanner.poll();
  await drainBurst();

  expect(deps.readProcessTable).not.toHaveBeenCalled();
});

test("a changed foreground command triggers the whole burst", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "zsh")]);
  await scanner.poll();
  await drainBurst();
  deps.readProcessTable.mockClear();

  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  await scanner.poll();
  await drainBurst();

  expect(deps.readProcessTable).toHaveBeenCalledTimes(PORT_SCAN_BURST_MS.length);
});

test("sweeps anyway once the quiet ticks run out", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  await scanner.poll();
  await drainBurst();
  deps.readProcessTable.mockClear();

  for (let i = 0; i < PORT_SCAN_IDLE_TICKS - 1; i += 1) await scanner.poll();
  expect(deps.readProcessTable).not.toHaveBeenCalled();

  await scanner.poll();
  expect(deps.readProcessTable).toHaveBeenCalledTimes(1);
});

test("reports the port of a process under a pane's shell", async () => {
  const { scanner, emitted, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n200 100\n");
  deps.readListeners.mockResolvedValue("p200\nn127.0.0.1:5173\n");

  await scanner.poll();
  await drainBurst();

  expect(emitted[0]).toEqual([{ sessionId: "a", ports: [5173] }]);
});

test("skips sessions that are only sitting at a prompt", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "zsh"), pane("b", 200, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n200 1\n201 200\n");

  await scanner.poll();
  await drainBurst();

  // Only the busy session's subtree is handed to lsof — 100 is never probed.
  expect(deps.readListeners).toHaveBeenCalledWith(expect.arrayContaining([200, 201]));
  expect(deps.readListeners).not.toHaveBeenCalledWith(expect.arrayContaining([100]));
});

test("scans a split session whole when only one of its panes is busy", async () => {
  const { scanner, emitted, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "zsh"), pane("a", 200, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n200 1\n201 200\n");
  deps.readListeners.mockResolvedValue("p201\nn*:3000\n");

  await scanner.poll();
  await drainBurst();

  expect(emitted[0]).toEqual([{ sessionId: "a", ports: [3000] }]);
});

test("emits once for a burst that keeps finding the same ports", async () => {
  const { scanner, emitted, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n");
  deps.readListeners.mockResolvedValue("p100\nn127.0.0.1:5173\n");

  await scanner.poll();
  await drainBurst();

  expect(emitted).toHaveLength(1);
});

test("clears the ports when the server stops", async () => {
  const { scanner, emitted, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n");
  deps.readListeners.mockResolvedValue("p100\nn127.0.0.1:5173\n");
  await scanner.poll();
  await drainBurst();

  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "zsh")]);
  await scanner.poll();
  await drainBurst();

  expect(emitted).toEqual([[{ sessionId: "a", ports: [5173] }], []]);
});

test("a failed sweep leaves the last known ports on screen", async () => {
  const { scanner, emitted, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);
  deps.readProcessTable.mockResolvedValue("100 1\n");
  deps.readListeners.mockResolvedValue("p100\nn127.0.0.1:5173\n");
  await scanner.poll();
  await drainBurst();

  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "bun")]);
  deps.readListeners.mockRejectedValue(new Error("lsof exploded"));
  await scanner.poll();
  await drainBurst();

  expect(emitted).toHaveLength(1);
});

test("a tmux failure during a poll is not treated as a change", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockRejectedValue(new Error("no server running"));

  await scanner.poll();
  await drainBurst();

  expect(deps.readProcessTable).not.toHaveBeenCalled();
});

test("stop() cancels the sweeps a burst had queued", async () => {
  const { scanner, deps } = setup();
  deps.listPaneProcesses.mockResolvedValue([pane("a", 100, "node")]);

  await scanner.poll();
  scanner.stop();
  await drainBurst();

  // Only the immediate sweep of the burst got through.
  expect(deps.readProcessTable).toHaveBeenCalledTimes(1);
});

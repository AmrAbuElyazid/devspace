import { expect, test } from "vitest";

import {
  attributePorts,
  collectSubtrees,
  parseLsofListeners,
  parseProcessTable,
} from "./port-scan";

test("parses a ps table and skips anything malformed", () => {
  const rows = parseProcessTable(
    ["  501     1", "  600   501", "garbage", "", "  700   600  extra"].join("\n"),
  );

  expect(rows).toEqual([
    { pid: 501, ppid: 1 },
    { pid: 600, ppid: 501 },
  ]);
});

test("collects a session's whole subtree, not just its direct children", () => {
  const rows = parseProcessTable(["100 1", "200 100", "300 200", "400 300", "999 1"].join("\n"));

  const { byKey, all } = collectSubtrees(rows, new Map([["session-a", [100]]]));

  expect([...(byKey.get("session-a") ?? [])].toSorted((a, b) => a - b)).toEqual([
    100, 200, 300, 400,
  ]);
  // An unrelated process must not be swept in — this is what keeps a chat
  // client's bundled server from being attributed to a workspace.
  expect(all.has(999)).toBe(false);
});

test("sweeps every pane of a split session under one key", () => {
  const rows = parseProcessTable(["100 1", "101 100", "200 1", "201 200"].join("\n"));

  const { byKey } = collectSubtrees(rows, new Map([["session-a", [100, 200]]]));

  expect([...(byKey.get("session-a") ?? [])].toSorted((a, b) => a - b)).toEqual([
    100, 101, 200, 201,
  ]);
});

test("survives a parent cycle instead of hanging", () => {
  const rows = [
    { pid: 10, ppid: 20 },
    { pid: 20, ppid: 10 },
  ];

  const { byKey } = collectSubtrees(rows, new Map([["session-a", [10]]]));

  expect([...(byKey.get("session-a") ?? [])].toSorted((a, b) => a - b)).toEqual([10, 20]);
});

test("keeps sibling sessions' subtrees separate", () => {
  const rows = parseProcessTable(["100 1", "101 100", "200 1", "201 200"].join("\n"));

  const { byKey } = collectSubtrees(
    rows,
    new Map([
      ["session-a", [100]],
      ["session-b", [200]],
    ]),
  );

  expect([...(byKey.get("session-a") ?? [])]).toEqual([100, 101]);
  expect([...(byKey.get("session-b") ?? [])]).toEqual([200, 201]);
});

test("parses lsof -Fpn records into ports per pid", () => {
  const listeners = parseLsofListeners(
    ["p820", "f10", "n127.0.0.1:5432", "p900", "f11", "n*:5173", "f12", "n[::1]:5173"].join("\n"),
  );

  expect(listeners.get(820)).toEqual([5432]);
  // Both IPv4 wildcard and IPv6 forms resolve to the same port, listed once.
  expect(listeners.get(900)).toEqual([5173]);
});

test("ignores lsof rows with no parseable port", () => {
  const listeners = parseLsofListeners(["p1", "nnotanaddress", "n127.0.0.1:notaport"].join("\n"));

  expect(listeners.size).toBe(0);
});

test("ignores address records that arrive before any pid", () => {
  expect(parseLsofListeners(["n127.0.0.1:3000", "p5", "n127.0.0.1:4000"].join("\n"))).toEqual(
    new Map([[5, [4000]]]),
  );
});

test("attributes a port to the session whose subtree owns the process", () => {
  const attributed = attributePorts(
    new Map([
      ["session-a", new Set([100, 101])],
      ["session-b", new Set([200])],
    ]),
    new Map([
      [101, [5173]],
      [200, [8787]],
      [999, [9999]],
    ]),
  );

  expect(attributed).toEqual([
    { sessionId: "session-a", ports: [5173] },
    // A listener outside every subtree belongs to no workspace.
    { sessionId: "session-b", ports: [8787] },
  ]);
});

test("sorts a session's ports so the row label does not reshuffle between sweeps", () => {
  const attributed = attributePorts(
    new Map([["session-a", new Set([1, 2, 3])]]),
    new Map([
      [1, [9229]],
      [2, [3000]],
      [3, [5173]],
    ]),
  );

  expect(attributed[0]?.ports).toEqual([3000, 5173, 9229]);
});

test("a session with nothing listening reports an empty list, not an absence", () => {
  const attributed = attributePorts(new Map([["session-a", new Set([1])]]), new Map());

  expect(attributed).toEqual([{ sessionId: "session-a", ports: [] }]);
});

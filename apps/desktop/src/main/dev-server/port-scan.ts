/**
 * Finding the TCP ports a workspace is serving on.
 *
 * The approach is borrowed from cmux, whose scanner is the best treatment of
 * this problem I have seen. Three ideas carry it:
 *
 * 1. **Scope by process subtree.** A machine is full of processes that look
 *    like dev servers — an editor's language server, a bundled `codex`
 *    app-server inside a chat client, a daemonised `opencode serve`. Matching
 *    on names globally attributes all of them to whatever workspace is open.
 *    Only descendants of a pane's own shell count.
 * 2. **One sweep for everything.** A single `ps` builds the whole process tree,
 *    and a single `lsof` covers every pane's pids at once. Per-pane scanning
 *    turns a dozen panes into a dozen forks.
 * 3. **Ask the kernel, not a heuristic.** `lsof -iTCP -sTCP:LISTEN` is the
 *    ground truth for "is something serving here", and it hands back the port
 *    number. Guessing from process names misfires on `tail -f` and misses
 *    anything not on a known list.
 *
 * Everything here is pure parsing and tree-walking; the process spawning is
 * injected so the awkward cases can be tested without a machine that happens
 * to be running a dev server.
 */

import type { DevServerPorts } from "../../shared/dev-server";

interface ProcessRow {
  pid: number;
  ppid: number;
}

/** `ps -axo pid=,ppid=` output. Anything unparseable is skipped, not fatal. */
export function parseProcessTable(stdout: string): ProcessRow[] {
  const rows: ProcessRow[] = [];

  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (Number.isInteger(pid) && Number.isInteger(ppid)) rows.push({ pid, ppid });
  }

  return rows;
}

/**
 * Every pid at or beneath each key's roots, as one flat set plus a per-key map.
 *
 * A key takes a list of roots rather than one, because a tmux session holds as
 * many panes as the user has split it into and each of those is its own shell.
 *
 * Walks children-of rather than parents-of so a single pass over the table
 * serves every root, and guards against the cycles a reparented process can
 * briefly present.
 */
export function collectSubtrees(
  rows: ProcessRow[],
  rootsByKey: Map<string, number[]>,
): { all: Set<number>; byKey: Map<string, Set<number>> } {
  const childrenByParent = new Map<number, number[]>();
  for (const row of rows) {
    const siblings = childrenByParent.get(row.ppid);
    if (siblings) siblings.push(row.pid);
    else childrenByParent.set(row.ppid, [row.pid]);
  }

  const all = new Set<number>();
  const byKey = new Map<string, Set<number>>();

  for (const [key, roots] of rootsByKey) {
    const owned = new Set<number>();
    const queue = [...roots];

    while (queue.length > 0) {
      const pid = queue.pop() as number;
      if (owned.has(pid)) continue;
      owned.add(pid);
      all.add(pid);
      const children = childrenByParent.get(pid);
      if (children) queue.push(...children);
    }

    byKey.set(key, owned);
  }

  return { all, byKey };
}

/**
 * `lsof -Fpn` output: alternating `p<pid>` and `n<address>` records.
 *
 * `-F` is the machine-readable mode; each field is one line prefixed by its
 * type. Addresses arrive as `127.0.0.1:5173`, `[::1]:5173` or `*:5173`, so the
 * port is whatever follows the final colon.
 */
export function parseLsofListeners(stdout: string): Map<number, number[]> {
  const byPid = new Map<number, number[]>();
  let currentPid: number | null = null;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) {
      const pid = Number(line.slice(1));
      currentPid = Number.isInteger(pid) ? pid : null;
      continue;
    }

    if (!line.startsWith("n") || currentPid === null) continue;

    const address = line.slice(1);
    const colon = address.lastIndexOf(":");
    if (colon < 0) continue;

    const port = Number(address.slice(colon + 1));
    if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;

    const ports = byPid.get(currentPid);
    if (ports) {
      if (!ports.includes(port)) ports.push(port);
    } else {
      byPid.set(currentPid, [port]);
    }
  }

  return byPid;
}

/** Attribute each listening port to the session whose subtree owns its process. */
export function attributePorts(
  subtreesBySession: Map<string, Set<number>>,
  listenersByPid: Map<number, number[]>,
): DevServerPorts[] {
  const result: DevServerPorts[] = [];

  for (const [sessionId, pids] of subtreesBySession) {
    const ports = new Set<number>();
    for (const pid of pids) {
      for (const port of listenersByPid.get(pid) ?? []) ports.add(port);
    }
    // Ascending so the row's "lowest port, +n more" stays stable between
    // sweeps; an unordered set would reshuffle the label on every scan.
    result.push({ sessionId, ports: [...ports].toSorted((a, b) => a - b) });
  }

  return result;
}

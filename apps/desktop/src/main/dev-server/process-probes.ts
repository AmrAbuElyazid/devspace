import { execFile } from "child_process";

const PROBE_TIMEOUT_MS = 4_000;
const PROBE_MAX_BUFFER = 4 * 1024 * 1024;

/**
 * How many pids one `lsof` invocation is allowed to ask about.
 *
 * `-p` takes a comma-separated list, which lands on the command line and so
 * against `ARG_MAX`. At roughly 7 bytes per pid this cap is two orders of
 * magnitude clear of the limit; it exists so a runaway process tree degrades
 * into a partial answer instead of a spawn failure.
 */
const MAX_PROBED_PIDS = 2_000;

/**
 * Distinguishes "the probe ran and found nothing" from "the probe did not run".
 *
 * `lsof` exits 1 whenever any pid it was asked about has no matching file,
 * which covers both the workspace with no server running *and* the successful
 * scan where only one of twenty processes is listening. Treating a non-zero
 * exit as failure would freeze the last known ports on screen forever after a
 * server stopped. Only a spawn error — where `code` is an errno string rather
 * than an exit status — or a timeout is a real failure.
 */
function isProbeFailure(error: Error & { code?: unknown; killed?: boolean }): boolean {
  return error.killed === true || typeof error.code === "string";
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, maxBuffer: PROBE_MAX_BUFFER },
      (error, stdout) => {
        if (error && isProbeFailure(error)) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** The whole process table as `pid ppid` pairs. */
export function readProcessTable(): Promise<string> {
  return run("/bin/ps", ["-axo", "pid=,ppid="]);
}

/**
 * Listening TCP sockets owned by any of `pids`, in `lsof`'s field format.
 *
 * `-n` and `-P` skip DNS and service-name lookups, which is the difference
 * between a few milliseconds and a few hundred. `-a` makes the pid filter and
 * the socket filter intersect rather than union — without it every open file
 * of every pid comes back.
 */
export function readListeners(pids: number[]): Promise<string> {
  if (pids.length === 0) return Promise.resolve("");
  const probed = pids.length > MAX_PROBED_PIDS ? pids.slice(0, MAX_PROBED_PIDS) : pids;
  return run("/usr/sbin/lsof", [
    "-nP",
    "-a",
    "-p",
    probed.join(","),
    "-iTCP",
    "-sTCP:LISTEN",
    "-Fpn",
  ]);
}

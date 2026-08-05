import { createServer } from "net";
import { describe, expect, test } from "vitest";

import { readListeners, readProcessTable } from "./process-probes";

/**
 * These spawn the real `/bin/ps` and `/usr/sbin/lsof`, which is the point —
 * the exit codes and output shapes they assert are exactly what a mock would
 * have got wrong. Both are macOS paths, and the app is a macOS app, but the
 * Linux CI job still runs the unit suite. The macOS job runs it too, so this
 * keeps its coverage rather than trading it for portability the app does not
 * need.
 */
const onDarwin = describe.skipIf(process.platform !== "darwin");

onDarwin("process probes", () => {
  test("reads the process table as pid/ppid pairs", async () => {
    const stdout = await readProcessTable();

    expect(stdout).toMatch(/^\s*\d+\s+\d+$/m);
    // Every process descends from launchd, so pid 1 is always in there.
    expect(stdout).toMatch(/^\s*1\s+0$/m);
  });

  test("an lsof that matches nothing is an empty answer, not a failure", async () => {
    // launchd holds no listening TCP socket, so this is the exit-1-with-no-output
    // path the scanner must not mistake for a broken probe.
    await expect(readListeners([1])).resolves.toBe("");
  });

  test("does not spawn anything for an empty pid list", async () => {
    await expect(readListeners([])).resolves.toBe("");
  });

  test("finds this process's own listener when it has one", async () => {
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });

    try {
      const stdout = await readListeners([process.pid]);
      expect(stdout).toContain(`p${process.pid}`);
      expect(stdout).toContain(`:${port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

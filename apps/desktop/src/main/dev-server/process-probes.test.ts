import { createServer } from "net";
import { expect, test } from "vitest";

import { readListeners, readProcessTable } from "./process-probes";

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

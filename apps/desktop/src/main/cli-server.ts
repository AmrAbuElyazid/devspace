import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";
import { join } from "node:path";

type CliServerOptions = {
  port: number;
  authToken: string;
  onOpenEditor: (folderPath: string) => void;
  statPath?: (path: string) => { isDirectory: () => boolean };
};

export function createCliHttpServer(options: CliServerOptions): Server {
  const statPath = options.statPath ?? ((path: string) => statSync(path));

  const server = createHttpServer((req, res) => {
    if (!req.url) {
      res.writeHead(404).end();
      return;
    }

    const token = req.headers["x-devspace-token"];
    if (token !== options.authToken) {
      res.writeHead(403).end("forbidden");
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${options.port}`);

    if (url.pathname !== "/open-editor") {
      res.writeHead(404).end();
      return;
    }

    const folderPath = url.searchParams.get("path");
    try {
      if (folderPath && statPath(folderPath).isDirectory()) {
        options.onOpenEditor(folderPath);
        res.writeHead(200).end("ok");
      } else {
        res.writeHead(400).end("invalid path");
      }
    } catch (error) {
      console.warn("[main] Path validation failed:", error);
      res.writeHead(400).end("invalid path");
    }
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      // Another Devspace already owns the port. Not fatal — the app runs fine
      // without a CLI endpoint — but silence here is what made this look like
      // a broken CLI rather than a second instance.
      console.warn(
        "[cli] port already in use by another Devspace instance; `devspace .` " +
          "will reach that one. Set DEVSPACE_CLI_PORT to run a second endpoint.",
      );
      return;
    }
    console.error("[cli] HTTP server error:", error);
  });

  return server;
}

/**
 * Publish the token for the port this instance actually bound.
 *
 * Any other `token.*` in the directory goes with it. The filename is how the
 * CLI finds the port, so one left behind by a previous run on a different port
 * advertises a server that is no longer there — and the CLI has no way to tell
 * which of two files is live.
 */
export function writeCliAuthTokenFile(userDataPath: string, port: number, authToken: string): void {
  const tokenDir = join(userDataPath, "cli");
  mkdirSync(tokenDir, { recursive: true });

  const current = `token.${port}`;
  try {
    for (const name of readdirSync(tokenDir)) {
      if (name.startsWith("token.") && name !== current) rmSync(join(tokenDir, name));
    }
  } catch (error) {
    console.warn("[cli] could not clear stale token files:", error);
  }

  writeFileSync(join(tokenDir, current), authToken, { mode: 0o600 });
}

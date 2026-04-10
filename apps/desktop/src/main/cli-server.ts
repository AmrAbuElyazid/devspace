import { mkdirSync, statSync, writeFileSync } from "node:fs";
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

  server.on("error", (error) => {
    console.error("[cli] HTTP server error:", error);
  });

  return server;
}

export function writeCliAuthTokenFile(userDataPath: string, port: number, authToken: string): void {
  const tokenDir = join(userDataPath, "cli");
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, `token.${port}`), authToken, { mode: 0o600 });
}

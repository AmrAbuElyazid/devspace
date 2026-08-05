import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCliHttpServer, writeCliAuthTokenFile } from "./cli-server";

function requestServer(
  port: number,
  path: string,
  token?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: token ? { "x-devspace-token": token } : undefined,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("cli-server", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests without a valid auth token", async () => {
    const server = createCliHttpServer({
      port: 21549,
      authToken: "secret-token",
      onOpenEditor: vi.fn(),
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP server address");
    }

    try {
      const result = await requestServer(address.port, "/open-editor?path=/tmp/project");
      expect(result).toEqual({ statusCode: 403, body: "forbidden" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("opens the requested editor folder when the token and path are valid", async () => {
    const onOpenEditor = vi.fn();
    const server = createCliHttpServer({
      port: 21549,
      authToken: "secret-token",
      onOpenEditor,
      statPath: () => ({ isDirectory: () => true }),
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP server address");
    }

    try {
      const result = await requestServer(
        address.port,
        "/open-editor?path=%2Ftmp%2Fproject",
        "secret-token",
      );

      expect(result).toEqual({ statusCode: 200, body: "ok" });
      expect(onOpenEditor).toHaveBeenCalledWith("/tmp/project");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("rejects invalid editor paths", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onOpenEditor = vi.fn();
    const server = createCliHttpServer({
      port: 21549,
      authToken: "secret-token",
      onOpenEditor,
      statPath: () => {
        throw new Error("missing");
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP server address");
    }

    try {
      const result = await requestServer(
        address.port,
        "/open-editor?path=%2Ftmp%2Fproject",
        "secret-token",
      );

      expect(result).toEqual({ statusCode: 400, body: "invalid path" });
      expect(onOpenEditor).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe("writeCliAuthTokenFile", () => {
  it("leaves exactly one token behind, naming the port that was bound", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "devspace-cli-token-"));
    try {
      writeCliAuthTokenFile(userDataPath, 21649, "first");
      writeCliAuthTokenFile(userDataPath, 51000, "second");

      const tokenDir = join(userDataPath, "cli");
      // The filename is how the CLI finds the port, so one left over from a
      // run on a different port advertises a server that is no longer there.
      expect(readdirSync(tokenDir)).toEqual(["token.51000"]);
      expect(readFileSync(join(tokenDir, "token.51000"), "utf8")).toBe("second");
    } finally {
      await rm(userDataPath, { recursive: true, force: true });
    }
  });

  it("keeps the token readable only by its owner", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "devspace-cli-token-"));
    try {
      writeCliAuthTokenFile(userDataPath, 51000, "secret");

      const mode = statSync(join(userDataPath, "cli", "token.51000")).mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      await rm(userDataPath, { recursive: true, force: true });
    }
  });
});

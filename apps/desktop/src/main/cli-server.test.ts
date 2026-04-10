import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "node:http";
import { createCliHttpServer } from "./cli-server";

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

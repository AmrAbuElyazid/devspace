import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

async function loadSharedIpc() {
  const handlers = new Map<string, (event: any, ...args: unknown[]) => unknown>();

  vi.doMock("electron", () => ({
    ipcMain: {
      handle: (channel: string, handler: (event: any, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
      on: (channel: string, handler: (event: any, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
    },
  }));

  const shared = await import("../ipc/shared");
  return { handlers, shared };
}

test("safeHandle rejects senders outside the trusted webContents set", async () => {
  const trustedSender = { id: 1 };
  const untrustedSender = { id: 2 };
  const { handlers, shared } = await loadSharedIpc();
  const handler = vi.fn(() => "ok");

  shared.trustIpcWebContents(trustedSender as any);
  shared.safeHandle("secure:invoke", handler);

  const wrappedHandler = handlers.get("secure:invoke");
  expect(wrappedHandler).toBeTypeOf("function");
  expect(wrappedHandler?.({ sender: trustedSender })).toBe("ok");
  expect(() => wrappedHandler?.({ sender: untrustedSender })).toThrow(
    /Rejected IPC call from untrusted sender/,
  );
  expect(handler).toHaveBeenCalledTimes(1);
  shared.untrustIpcWebContents(trustedSender as any);
});

test("safeOn ignores senders outside the trusted webContents set", async () => {
  const trustedSender = { id: 1 };
  const untrustedSender = { id: 2 };
  const { handlers, shared } = await loadSharedIpc();
  const handler = vi.fn();

  shared.trustIpcWebContents(trustedSender as any);
  shared.safeOn("secure:event", handler);

  const wrappedHandler = handlers.get("secure:event");
  expect(wrappedHandler).toBeTypeOf("function");
  wrappedHandler?.({ sender: untrustedSender });
  wrappedHandler?.({ sender: trustedSender });
  expect(handler).toHaveBeenCalledTimes(1);
  shared.untrustIpcWebContents(trustedSender as any);
});

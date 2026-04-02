import { test, expect } from "vitest";
import type { Session } from "electron";
import { BROWSER_PARTITION, BrowserSessionManager } from "../browser-session-manager";

type PermissionCheckHandler = Parameters<Session["setPermissionCheckHandler"]>[0];
type PermissionRequestHandler = Parameters<NonNullable<Session["setPermissionRequestHandler"]>>[0];
type CertificateVerifyProc = Parameters<Session["setCertificateVerifyProc"]>[0];
type CertificateErrorListener = (
  event: { preventDefault: () => void },
  webContents: { id: number },
  url: string,
  error: string,
  certificate: unknown,
  callback: (isTrusted: boolean) => void,
) => void;

test("uses a dedicated persistent browser partition", () => {
  expect(BROWSER_PARTITION).toBe("persist:devspace-global-browser");
});

test("getSession uses fromPartition with the shared browser partition", () => {
  const fakeSession = {
    setPermissionCheckHandler: () => {},
    setCertificateVerifyProc: () => {},
  };
  let partition: string | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: (nextPartition) => {
      partition = nextPartition;
      return fakeSession as never;
    },
  });

  const session = manager.getSession();

  expect(partition).toBe(BROWSER_PARTITION);
  expect(session).toBe(fakeSession);
});

test("CORS overrides only apply to explicitly registered trusted local referrers", () => {
  let onHeadersReceived:
    | ((
        details: { referrer?: string; responseHeaders?: Record<string, string[]> },
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
      ) => void)
    | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        webRequest: {
          onHeadersReceived: (
            handler: (
              details: { referrer?: string; responseHeaders?: Record<string, string[]> },
              callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
            ) => void,
          ) => {
            onHeadersReceived = handler;
          },
        },
      }) as never,
  });

  manager.registerTrustedLocalOrigin("http://127.0.0.1:18562/workbench");
  manager.getSession();

  let localResponse: { responseHeaders?: Record<string, string[]> } | undefined;
  onHeadersReceived?.(
    {
      referrer: "http://127.0.0.1:18562/workbench",
      responseHeaders: {
        "Access-Control-Allow-Origin": ["https://example.com"],
        "X-Test": ["ok"],
      },
    },
    (response) => {
      localResponse = response;
    },
  );

  expect(localResponse).toEqual({
    responseHeaders: {
      "Access-Control-Allow-Origin": ["http://127.0.0.1:18562"],
      "Access-Control-Allow-Methods": ["GET, POST, PUT, DELETE, PATCH, OPTIONS"],
      "Access-Control-Allow-Headers": ["*"],
      "Access-Control-Allow-Credentials": ["true"],
      "Access-Control-Expose-Headers": ["*"],
      "X-Test": ["ok"],
    },
  });

  let untrustedLoopbackResponse: { responseHeaders?: Record<string, string[]> } | undefined;
  onHeadersReceived?.(
    {
      referrer: "http://127.0.0.1:3000/app",
      responseHeaders: {
        "Access-Control-Allow-Origin": ["https://example.com"],
        "X-Test": ["ok"],
      },
    },
    (response) => {
      untrustedLoopbackResponse = response;
    },
  );

  expect(untrustedLoopbackResponse).toEqual({
    responseHeaders: {
      "Access-Control-Allow-Origin": ["https://example.com"],
      "X-Test": ["ok"],
    },
  });
});

test("trusted local origin registration is ref-counted for shared editor origins", () => {
  let onHeadersReceived:
    | ((
        details: { referrer?: string; responseHeaders?: Record<string, string[]> },
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
      ) => void)
    | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        webRequest: {
          onHeadersReceived: (
            handler: (
              details: { referrer?: string; responseHeaders?: Record<string, string[]> },
              callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
            ) => void,
          ) => {
            onHeadersReceived = handler;
          },
        },
      }) as never,
  });

  manager.registerTrustedLocalOrigin("http://127.0.0.1:18562/?folder=/tmp/a");
  manager.registerTrustedLocalOrigin("http://127.0.0.1:18562/?folder=/tmp/b");
  manager.getSession();

  const invokeHeadersReceived = () => {
    let response: { responseHeaders?: Record<string, string[]> } | undefined;
    onHeadersReceived?.(
      {
        referrer: "http://127.0.0.1:18562/workbench",
        responseHeaders: {
          "Access-Control-Allow-Origin": ["https://example.com"],
        },
      },
      (nextResponse) => {
        response = nextResponse;
      },
    );
    return response;
  };

  expect(invokeHeadersReceived()).toEqual({
    responseHeaders: {
      "Access-Control-Allow-Origin": ["http://127.0.0.1:18562"],
      "Access-Control-Allow-Methods": ["GET, POST, PUT, DELETE, PATCH, OPTIONS"],
      "Access-Control-Allow-Headers": ["*"],
      "Access-Control-Allow-Credentials": ["true"],
      "Access-Control-Expose-Headers": ["*"],
    },
  });

  manager.unregisterTrustedLocalOrigin("http://127.0.0.1:18562/?folder=/tmp/a");
  expect(invokeHeadersReceived()).toEqual({
    responseHeaders: {
      "Access-Control-Allow-Origin": ["http://127.0.0.1:18562"],
      "Access-Control-Allow-Methods": ["GET, POST, PUT, DELETE, PATCH, OPTIONS"],
      "Access-Control-Allow-Headers": ["*"],
      "Access-Control-Allow-Credentials": ["true"],
      "Access-Control-Expose-Headers": ["*"],
    },
  });

  manager.unregisterTrustedLocalOrigin("http://127.0.0.1:18562/?folder=/tmp/b");
  expect(invokeHeadersReceived()).toEqual({
    responseHeaders: {
      "Access-Control-Allow-Origin": ["https://example.com"],
    },
  });
});

test("installHandlers registers a permission check handler on the session", () => {
  let registeredHandler: PermissionCheckHandler | undefined;
  let registeredRequestHandler: PermissionRequestHandler | undefined;
  let registeredVerifyProc: CertificateVerifyProc | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
          registeredHandler = handler;
        },
        setPermissionRequestHandler: (handler: PermissionRequestHandler) => {
          registeredRequestHandler = handler;
        },
        setCertificateVerifyProc: (handler: CertificateVerifyProc) => {
          registeredVerifyProc = handler;
        },
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule: { on: () => undefined },
    log: () => {},
  });

  expect(typeof registeredHandler).toBe("function");
  expect(typeof registeredRequestHandler).toBe("function");
  expect(typeof registeredVerifyProc).toBe("function");
  expect(
    registeredHandler?.({ id: 1 } as never, "notifications", "https://example.com", {} as never),
  ).toBe(false);
});

test("permission request handler emits a mapped browser permission request", () => {
  let registeredRequestHandler: PermissionRequestHandler | undefined;
  const requested: Array<{
    paneId: string;
    origin: string;
    permissionType: string;
    requestToken: string;
  }> = [];

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: (handler: PermissionRequestHandler) => {
          registeredRequestHandler = handler;
        },
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => (webContentsId === 12 ? "pane-12" : undefined),
    reportCertificateError: () => {},
    requestBrowserPermission: (request, resolve) => {
      requested.push(request);
      resolve("allow-once");
    },
    appModule: { on: () => undefined },
    log: () => {},
  });

  let allowed: boolean | undefined;
  registeredRequestHandler?.(
    {
      id: 12,
      getURL: () => "https://camera.example/path",
    } as never,
    "media",
    (nextAllowed) => {
      allowed = nextAllowed;
    },
    {
      mediaType: "video",
      requestingUrl: "https://camera.example/path",
    } as never,
  );

  expect(allowed).toBe(true);
  expect(requested.length).toBe(1);
  expect(requested[0]?.paneId).toBe("pane-12");
  expect(requested[0]?.origin).toBe("https://camera.example");
  expect(requested[0]?.permissionType).toBe("camera");
  expect(typeof requested[0]?.requestToken).toBe("string");
});

test("allow-for-session is remembered by permission check handler for the same origin and permission type", () => {
  let registeredHandler: PermissionCheckHandler | undefined;
  let registeredRequestHandler: PermissionRequestHandler | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
          registeredHandler = handler;
        },
        setPermissionRequestHandler: (handler: PermissionRequestHandler) => {
          registeredRequestHandler = handler;
        },
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => (webContentsId === 12 ? "pane-12" : undefined),
    reportCertificateError: () => {},
    requestBrowserPermission: (_request, resolve) => {
      resolve("allow-for-session");
    },
    appModule: { on: () => undefined },
    log: () => {},
  });

  let allowed: boolean | undefined;
  registeredRequestHandler?.(
    {
      id: 12,
      getURL: () => "https://camera.example/path",
    } as never,
    "media",
    (nextAllowed) => {
      allowed = nextAllowed;
    },
    {
      mediaType: "video",
      requestingUrl: "https://camera.example/path",
    } as never,
  );

  expect(allowed).toBe(true);
  expect(
    registeredHandler?.({ id: 12 } as never, "media", "https://camera.example", {
      mediaType: "video",
      requestingUrl: "https://camera.example/path",
    } as never),
  ).toBe(true);
});

test("allow-for-session still passes permission checks without webContents when origin is known", () => {
  let registeredHandler: PermissionCheckHandler | undefined;
  let registeredRequestHandler: PermissionRequestHandler | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
          registeredHandler = handler;
        },
        setPermissionRequestHandler: (handler: PermissionRequestHandler) => {
          registeredRequestHandler = handler;
        },
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => (webContentsId === 12 ? "pane-12" : undefined),
    reportCertificateError: () => {},
    requestBrowserPermission: (_request, resolve) => {
      resolve("allow-for-session");
    },
    appModule: { on: () => undefined },
    log: () => {},
  });

  registeredRequestHandler?.(
    {
      id: 12,
      getURL: () => "https://camera.example/path",
    } as never,
    "notifications",
    () => {},
    {
      requestingUrl: "https://camera.example/path",
    } as never,
  );

  expect(
    registeredHandler?.(null as never, "notifications", "https://camera.example", {} as never),
  ).toBe(true);
});

test("certificate verification fails closed without surfacing a pane failure directly", () => {
  let registeredVerifyProc: CertificateVerifyProc | undefined;
  const reported: Array<{ paneId: string; url: string }> = [];
  const logs: string[] = [];

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: () => {},
        setCertificateVerifyProc: (handler: CertificateVerifyProc) => {
          registeredVerifyProc = handler;
        },
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => (webContentsId === 9 ? "pane-9" : undefined),
    reportCertificateError: (paneId, url) => {
      reported.push({ paneId, url });
    },
    appModule: { on: () => undefined },
    log: (message) => {
      logs.push(message);
    },
  });

  let verificationResult: number | undefined;
  registeredVerifyProc?.(
    {
      hostname: "expired.badssl.com",
      verificationResult: "net::ERR_CERT_AUTHORITY_INVALID",
      errorCode: -202,
      validatedCertificate: {},
      certificate: {},
      isIssuedByKnownRoot: false,
      verificationTime: 0,
      webContents: { id: 9 },
    } as never,
    (result) => {
      verificationResult = result;
    },
  );

  expect(verificationResult).toBe(-2);
  expect(reported).toEqual([]);
  expect(logs.length).toBe(0);
});

test("permission checks fail closed and log when pane resolution fails", () => {
  let registeredHandler: PermissionCheckHandler | undefined;
  const logs: string[] = [];

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: (handler: PermissionCheckHandler) => {
          registeredHandler = handler;
        },
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule: { on: () => undefined },
    log: (message) => {
      logs.push(message);
    },
  });

  const allowed = registeredHandler?.(
    { id: 42 } as never,
    "notifications",
    "https://example.com",
    {} as never,
  );

  expect(allowed).toBe(false);
  expect(logs[0] ?? "").toMatch(/unresolved browser permission request/i);
});

test("certificate errors are blocked without surfacing a pane failure directly from the app listener", () => {
  let certificateErrorListener: CertificateErrorListener | undefined;
  const reported: Array<{ paneId: string; url: string }> = [];
  let prevented = false;
  let trusted: boolean | undefined;

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: () => {},
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) => (webContentsId === 7 ? "pane-7" : undefined),
    reportCertificateError: (paneId, url) => {
      reported.push({ paneId, url });
    },
    appModule: {
      on: (event, listener) => {
        if (event === "certificate-error") {
          certificateErrorListener = listener as CertificateErrorListener;
        }
        return undefined;
      },
    },
    log: () => {},
  });

  certificateErrorListener?.(
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    { id: 7 },
    "https://expired.badssl.com/",
    "ERR_CERT_AUTHORITY_INVALID",
    {},
    (isTrusted) => {
      trusted = isTrusted;
    },
  );

  expect(prevented).toBe(true);
  expect(trusted).toBe(false);
  expect(reported).toEqual([]);
});

test("installHandlers does not accumulate duplicate global certificate listeners", () => {
  const listeners: CertificateErrorListener[] = [];

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: () => {},
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  const appModule = {
    on: (_event: "certificate-error", listener: CertificateErrorListener) => {
      listeners.push(listener);
    },
  };

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule,
    log: () => {},
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: () => undefined,
    reportCertificateError: () => {},
    appModule,
    log: () => {},
  });

  expect(listeners.length).toBe(1);
});

test("global certificate listener still uses the latest callbacks while remaining side-effect free", () => {
  let certificateErrorListener: CertificateErrorListener | undefined;
  const reports: Array<{ paneId: string; url: string }> = [];

  const manager = new BrowserSessionManager({
    fromPartition: () =>
      ({
        setPermissionCheckHandler: () => {},
        setCertificateVerifyProc: () => {},
      }) as never,
  });

  const appModule = {
    on: (_event: "certificate-error", listener: CertificateErrorListener) => {
      certificateErrorListener = listener;
    },
  };

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) =>
      webContentsId === 1 ? "stale-pane" : undefined,
    reportCertificateError: (paneId, url) => {
      reports.push({ paneId, url });
    },
    appModule,
    log: () => {},
  });

  manager.installHandlers({
    resolvePaneIdForWebContents: (webContentsId) =>
      webContentsId === 2 ? "fresh-pane" : undefined,
    reportCertificateError: (paneId, url) => {
      reports.push({ paneId, url });
    },
    appModule,
    log: () => {},
  });

  let trusted: boolean | undefined;
  certificateErrorListener?.(
    { preventDefault: () => {} },
    { id: 2 },
    "https://expired.badssl.com/",
    "ERR_CERT_AUTHORITY_INVALID",
    {},
    (isTrusted) => {
      trusted = isTrusted;
    },
  );

  expect(trusted).toBe(false);
  expect(reports).toEqual([]);
});

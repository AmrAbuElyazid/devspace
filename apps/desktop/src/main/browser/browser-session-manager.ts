import type { Session } from "electron";
import { randomUUID } from "node:crypto";
import type {
  BrowserPermissionDecision,
  BrowserPermissionRequest,
  BrowserPermissionType,
} from "../../shared/browser";
import { getSecretKey, SECRET_KEY_ENDPOINT } from "../vscode-secret-key";
import { BROWSER_PARTITION } from "../dev-mode";

export { BROWSER_PARTITION };

/** 30 days from now, in seconds since epoch. */
function thirtyDays(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

function getElectronNet(): typeof import("electron").net {
  return (require("electron") as typeof import("electron")).net;
}

interface BrowserSessionModule {
  fromPartition(partition: string): Session;
}

interface BrowserSessionManagerDeps {
  resolvePaneIdForWebContents: (webContentsId: number) => string | undefined;
  reportCertificateError: (paneId: string, url: string) => void;
  requestBrowserPermission?: (
    request: BrowserPermissionRequest,
    resolve: (decision: BrowserPermissionDecision) => void,
  ) => void;
  appModule?: {
    on: (
      event: "certificate-error",
      listener: (
        event: { preventDefault: () => void },
        webContents: { id: number } | null,
        url: string,
        error: string,
        certificate: unknown,
        callback: (isTrusted: boolean) => void,
      ) => void,
    ) => unknown;
  };
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

type CertificateVerifyRequest = {
  hostname?: string;
  errorCode?: number;
  verificationResult?: string;
  webContents?: { id: number } | null;
};

type PermissionRequestDetails = {
  mediaType?: string;
  requestingUrl?: string;
};

type SessionPermissionGrantKey = `${BrowserPermissionType}|${string}`;

function mapPermissionType(
  permission: string,
  details: PermissionRequestDetails,
): BrowserPermissionType | null {
  if (permission === "geolocation" || permission === "notifications") {
    return permission;
  }

  if (permission === "media") {
    if (details.mediaType === "video") {
      return "camera";
    }
    if (details.mediaType === "audio") {
      return "microphone";
    }
  }

  return null;
}

function toRequestOrigin(
  rawUrl: string | undefined,
  fallbackUrl: string | undefined,
): string | null {
  const candidate = rawUrl || fallbackUrl;
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    // Expected: invalid URL format
    return null;
  }
}

function getTrustedLocalOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const normalizedHostname = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    const isLoopbackHost =
      normalizedHostname === "127.0.0.1" ||
      normalizedHostname === "localhost" ||
      normalizedHostname === "0.0.0.0" ||
      normalizedHostname === "::1";

    if (!isLoopbackHost) {
      return null;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function isVscodeMintKeyPath(pathname: string): boolean {
  return pathname === SECRET_KEY_ENDPOINT || pathname.endsWith("/_vscode-cli/mint-key");
}

function findResponseHeaderKey(
  headers: Record<string, string[]>,
  targetHeaderName: string,
): string | undefined {
  const normalizedTarget = targetHeaderName.toLowerCase();
  return Object.keys(headers).find((headerName) => headerName.toLowerCase() === normalizedTarget);
}

function setResponseHeader(
  headers: Record<string, string[]>,
  headerName: string,
  headerValue: string[],
): void {
  const existingHeaderName = findResponseHeaderKey(headers, headerName);
  if (existingHeaderName && existingHeaderName !== headerName) {
    delete headers[existingHeaderName];
  }

  headers[headerName] = headerValue;
}

function decisionAllows(decision: BrowserPermissionDecision): boolean {
  return decision === "allow-once" || decision === "allow-for-session";
}

function getElectronSession(): BrowserSessionModule {
  return require("electron").session as typeof import("electron").session;
}

function getElectronApp(): NonNullable<BrowserSessionManagerDeps["appModule"]> {
  return require("electron").app as typeof import("electron").app;
}

export class BrowserSessionManager {
  private certificateErrorListenerRegistered = false;
  private sessionLevelHandlersInstalled = false;
  private currentDeps: BrowserSessionManagerDeps | undefined;
  private currentLog: (message: string, meta?: Record<string, unknown>) => void = (
    message,
    meta,
  ) => {
    console.warn(message, meta);
  };
  private readonly sessionPermissionGrants = new Set<SessionPermissionGrantKey>();
  private readonly trustedLocalOrigins = new Map<string, number>();

  constructor(
    private readonly sessionModule: BrowserSessionModule = getElectronSession(),
    private readonly netModule: Pick<typeof import("electron").net, "fetch"> = getElectronNet(),
  ) {}

  /**
   * Return the shared browser session, creating it on first access.
   *
   * On macOS, `session.fromPartition("persist:…")` triggers Chromium's
   * `OSCrypt` init which accesses the Keychain.  By deferring this call
   * until the session is actually needed (first browser or editor pane)
   * we avoid the "devspace Safe Storage" Keychain prompt at startup.
   *
   * Session-level handlers (cookie persistence, CORS overrides, secret
   * key protocol handler) are installed once on the first call.
   */
  getSession(): Session {
    const ses = this.sessionModule.fromPartition(BROWSER_PARTITION);
    if (!this.sessionLevelHandlersInstalled) {
      this.sessionLevelHandlersInstalled = true;
      this.installSessionLevelHandlers(ses);
    }
    return ses;
  }

  registerTrustedLocalOrigin(rawUrl: string): void {
    const origin = getTrustedLocalOrigin(rawUrl);
    if (!origin) {
      return;
    }

    this.trustedLocalOrigins.set(origin, (this.trustedLocalOrigins.get(origin) ?? 0) + 1);
  }

  unregisterTrustedLocalOrigin(rawUrl: string): void {
    const origin = getTrustedLocalOrigin(rawUrl);
    if (!origin) {
      return;
    }

    const currentCount = this.trustedLocalOrigins.get(origin);
    if (!currentCount) {
      return;
    }

    if (currentCount === 1) {
      this.trustedLocalOrigins.delete(origin);
      return;
    }

    this.trustedLocalOrigins.set(origin, currentCount - 1);
  }

  /**
   * One-time setup for session-level handlers.  These are installed lazily
   * on first `getSession()` call rather than eagerly at app startup.
   *
   * Each handler is guarded so the class remains usable with minimal mocks
   * in unit tests (where cookies/webRequest/protocol may be absent).
   */
  private installSessionLevelHandlers(ses: Session): void {
    // Cast once — the guards below check for existence before calling.
    const sessionAny = ses as unknown as Record<string, unknown>;

    if (sessionAny.cookies) {
      this.persistSessionCookies(ses);
    }
    if (
      typeof (sessionAny.webRequest as Record<string, unknown>)?.onHeadersReceived === "function"
    ) {
      this.installCorsOverrides(ses);
    }
    if (typeof (sessionAny.protocol as Record<string, unknown>)?.handle === "function") {
      this.registerSecretKeyHandler(ses);
    }
  }

  /**
   * Convert session cookies (no expiry) into persistent cookies so auth
   * tokens survive app restarts.  Session cookies are ephemeral by design
   * in Chromium — without this, VS Code web logs the user out on every
   * quit because its auth cookies have no Expires header.
   */
  private persistSessionCookies(ses: Session): void {
    const cookies = ses.cookies as unknown as {
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      get?: (filter: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      set?: (details: Record<string, unknown>) => Promise<void>;
    };

    if (typeof cookies.on !== "function" || typeof cookies.set !== "function") return;

    cookies.on("changed", (...args: unknown[]) => {
      const [_event, cookie, _cause, removed] = args as [
        unknown,
        Record<string, unknown>,
        unknown,
        unknown,
      ];
      if (removed) return;
      // Only process session cookies (those without an expiration)
      if (cookie.session !== true) return;

      const url = `http${cookie.secure ? "s" : ""}://${cookie.domain as string}${(cookie.path as string) || "/"}`;
      void (cookies.set as (d: Record<string, unknown>) => Promise<void>)({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: thirtyDays(),
      }).catch(() => {
        // Silently ignore — some cookies can't be re-set (e.g. __Host- prefixed)
      });
    });
  }

  installHandlers(deps?: BrowserSessionManagerDeps): void {
    const ses = this.getSession();
    const log =
      deps?.log ??
      ((message: string, meta?: Record<string, unknown>) => {
        console.warn(message, meta);
      });
    this.currentDeps = deps;
    this.currentLog = log;

    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const permissionType = mapPermissionType(
        permission,
        (details ?? {}) as PermissionRequestDetails,
      );
      const origin = toRequestOrigin(
        (details as PermissionRequestDetails | undefined)?.requestingUrl,
        requestingOrigin,
      );

      if (
        permissionType &&
        origin &&
        this.sessionPermissionGrants.has(this.toSessionPermissionGrantKey(permissionType, origin))
      ) {
        return true;
      }

      if (!webContents) {
        log("[browser] missing webContents for permission request; denying by default", {
          permission,
          requestingOrigin,
          details,
        });
        return false;
      }

      const paneId = deps?.resolvePaneIdForWebContents(webContents.id);
      if (!paneId) {
        log("[browser] unresolved browser permission request; denying by default", {
          webContentsId: webContents.id,
          permission,
          requestingOrigin,
          details,
        });
        return false;
      }

      if (!permissionType || !origin) {
        return false;
      }

      return this.sessionPermissionGrants.has(
        this.toSessionPermissionGrantKey(permissionType, origin),
      );
    });

    if (typeof ses.setPermissionRequestHandler === "function") {
      ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (!webContents) {
          log("[browser] missing webContents for permission request prompt; denying by default", {
            permission,
            details,
          });
          callback(false);
          return;
        }

        const paneId = deps?.resolvePaneIdForWebContents(webContents.id);
        if (!paneId) {
          log("[browser] unresolved browser permission request prompt; denying by default", {
            webContentsId: webContents.id,
            permission,
            details,
          });
          callback(false);
          return;
        }

        const permissionType = mapPermissionType(
          permission,
          (details ?? {}) as PermissionRequestDetails,
        );
        const origin = toRequestOrigin(
          (details as PermissionRequestDetails | undefined)?.requestingUrl,
          typeof (webContents as { getURL?: () => string }).getURL === "function"
            ? (webContents as { getURL: () => string }).getURL()
            : undefined,
        );

        if (!permissionType || !origin || !deps?.requestBrowserPermission) {
          callback(false);
          return;
        }

        deps.requestBrowserPermission(
          {
            paneId,
            origin,
            permissionType,
            requestToken: randomUUID(),
          },
          (decision) => {
            if (decision === "allow-for-session") {
              this.sessionPermissionGrants.add(
                this.toSessionPermissionGrantKey(permissionType, origin),
              );
            }
            callback(decisionAllows(decision));
          },
        );
      });
    }

    if (typeof ses.setCertificateVerifyProc === "function") {
      ses.setCertificateVerifyProc(
        (request: CertificateVerifyRequest, callback: (verificationResult: number) => void) => {
          if (request.errorCode === 0 || request.verificationResult === "net::OK") {
            callback(-3);
            return;
          }

          const webContentsId = request.webContents?.id;
          if (typeof webContentsId !== "number") {
            log("[browser] missing webContents for certificate verification; denying by default", {
              hostname: request.hostname,
              errorCode: request.errorCode,
              verificationResult: request.verificationResult,
            });
            callback(-2);
            return;
          }

          if (!deps?.resolvePaneIdForWebContents(webContentsId)) {
            log("[browser] unresolved browser certificate verification; denying by default", {
              webContentsId,
              hostname: request.hostname,
              errorCode: request.errorCode,
              verificationResult: request.verificationResult,
            });
            callback(-2);
            return;
          }

          callback(-2);
        },
      );
    }

    if (!this.certificateErrorListenerRegistered) {
      this.certificateErrorListenerRegistered = true;
      const appModule = deps?.appModule ?? getElectronApp();
      appModule.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        const currentDeps = this.currentDeps;
        const currentLog = this.currentLog;

        if (!webContents) {
          currentLog("[browser] missing webContents for certificate error; denying by default", {
            url,
            error,
            certificate,
          });
          callback(false);
          return;
        }

        if (!currentDeps?.resolvePaneIdForWebContents(webContents.id)) {
          currentLog("[browser] unresolved browser certificate error; denying by default", {
            webContentsId: webContents.id,
            url,
            error,
            certificate,
          });
          callback(false);
          return;
        }

        callback(false);
      });
    }
  }

  /**
   * Override CORS response headers for requests initiated by trusted local
   * Devspace pages in the shared browser session.
   *
   * VS Code Settings Sync, GitHub auth, and Microsoft login endpoints don't
   * include `http://127.0.0.1:PORT` in their `Access-Control-Allow-Origin`.
   * We only relax CORS when the initiating page is one of our loopback-backed
   * app surfaces rather than for arbitrary browser pages in the same session.
   */
  private installCorsOverrides(ses: Session): void {
    ses.webRequest.onHeadersReceived((details, callback) => {
      const origin = getTrustedLocalOrigin(details.referrer);
      if (!origin || !this.trustedLocalOrigins.has(origin)) {
        callback({ responseHeaders: details.responseHeaders ?? {} });
        return;
      }

      const headers = { ...details.responseHeaders };

      // Narrow the override to just the loopback origin allowance needed by
      // our trusted local editor pages. Preserve any upstream allow/expose
      // headers instead of widening them to wildcards.
      setResponseHeader(headers, "Access-Control-Allow-Origin", [origin]);
      setResponseHeader(headers, "Access-Control-Allow-Credentials", ["true"]);

      callback({ responseHeaders: headers });
    });

    console.log("[browser-session] installed CORS overrides for browser session");
  }

  /**
   * Register an HTTP protocol handler on the browser session that intercepts
   * POST requests to the VS Code secret key endpoint.
   *
   * The `code serve-web` server sets a `vscode-secret-key-path` cookie
   * pointing to its own `/_vscode-cli/mint-key` endpoint, which returns an
   * *ephemeral* key that changes on every server restart.  We intercept that
   * POST and return our own *stable* key instead, so secrets encrypted and
   * stored in localStorage can be decrypted on subsequent app launches.
   */
  private registerSecretKeyHandler(ses: Session): void {
    ses.protocol.handle("http", (request) => {
      const url = new URL(request.url);
      const trustedOrigin = getTrustedLocalOrigin(request.url);
      if (
        isVscodeMintKeyPath(url.pathname) &&
        request.method === "POST" &&
        trustedOrigin &&
        this.trustedLocalOrigins.has(trustedOrigin)
      ) {
        // Defer getSecretKey() to the first actual request instead of calling
        // it eagerly at startup.  The key is cached after the first call, so
        // subsequent requests are instant.  This avoids a concurrent macOS
        // Keychain access (safeStorage) racing with Chromium's session cookie
        // encryption init, which caused two "devspace Safe Storage" prompts
        // on every launch.
        const keyBuffer = getSecretKey();
        console.log(
          `[browser-session] intercepted ${url.pathname} — serving stable secret key (${keyBuffer.length} bytes) for ${url.origin}`,
        );
        return new globalThis.Response(new Uint8Array(keyBuffer), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        }) as Response;
      }
      // Pass all other HTTP requests through to the default network stack.
      // bypassCustomProtocolHandlers is REQUIRED to prevent infinite recursion —
      // without it, net.fetch triggers our own handler again.
      return this.netModule.fetch(request, { bypassCustomProtocolHandlers: true });
    });

    console.log(
      "[browser-session] registered VS Code secret key handler (intercepting /_vscode-cli/mint-key)",
    );
  }

  private toSessionPermissionGrantKey(
    permissionType: BrowserPermissionType,
    origin: string,
  ): SessionPermissionGrantKey {
    return `${permissionType}|${origin}`;
  }
}

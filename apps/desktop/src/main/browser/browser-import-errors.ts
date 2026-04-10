export class BrowserImportServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BrowserImportServiceError";
  }
}

export function throwChromiumProviderWarnings(errorPrefix: string, warnings: string[]): void {
  const keychainWarning = findKeychainWarning(warnings);
  if (keychainWarning) {
    throw new BrowserImportServiceError(
      `${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`,
      keychainWarning,
      true,
    );
  }

  throwProviderWarning(`${errorPrefix}_COOKIE_IMPORT_FAILED`, warnings);
}

export function throwCookieImportError(code: string, error: unknown): never {
  throw new BrowserImportServiceError(code, errorMessage(error));
}

export function throwProviderWarning(code: string, warnings: string[]): void {
  const providerWarning = warnings[0];
  if (providerWarning) {
    throw new BrowserImportServiceError(code, providerWarning);
  }
}

export function throwChromiumCookieImportError(errorPrefix: string, error: unknown): never {
  const message = errorMessage(error);
  if (/keychain/i.test(message)) {
    throw new BrowserImportServiceError(`${errorPrefix}_KEYCHAIN_ACCESS_REQUIRED`, message, true);
  }

  throw new BrowserImportServiceError(`${errorPrefix}_COOKIE_IMPORT_FAILED`, message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findKeychainWarning(warnings: string[]): string | undefined {
  return warnings.find((warning) => /keychain/i.test(warning));
}

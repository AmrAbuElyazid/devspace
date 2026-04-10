import { execFileSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrowserImportSource } from "../../shared/browser";

export const CHROME_SAFE_STORAGE_TIMEOUT_MS = 15_000;

export const CHROMIUM_KEYCHAINS = {
  chrome: {
    root: join(homedir(), "Library", "Application Support", "Google", "Chrome"),
    account: "Chrome",
    service: "Chrome Safe Storage",
    label: "Chrome Safe Storage",
  },
  brave: {
    root: join(homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
    account: "Brave",
    service: "Brave Safe Storage",
    label: "Brave Safe Storage",
  },
  arc: {
    root: join(homedir(), "Library", "Application Support", "Arc", "User Data"),
    account: "Arc",
    service: "Arc Safe Storage",
    label: "Arc Safe Storage",
  },
  chromium: {
    root: join(homedir(), "Library", "Application Support", "Chromium"),
    account: "Chromium",
    service: "Chromium Safe Storage",
    label: "Chromium Safe Storage",
  },
} as const;

export type ChromiumBrowserTarget = keyof typeof CHROMIUM_KEYCHAINS;

export const IMPORT_SOURCE_TO_CHROMIUM: Partial<
  Record<BrowserImportSource, ChromiumBrowserTarget>
> = {
  chrome: "chrome",
  arc: "arc",
};

export function readChromeSafeStorageKey(target: ChromiumBrowserTarget): Buffer {
  const keychain = CHROMIUM_KEYCHAINS[target];
  const args = ["find-generic-password", "-w", "-a", keychain.account, "-s", keychain.service];

  try {
    const password = execFileSync("security", args, {
      encoding: "utf8",
      timeout: CHROME_SAFE_STORAGE_TIMEOUT_MS,
    }).trim();
    if (!password) {
      throw new Error(`Failed to read macOS Keychain (${keychain.label}): empty password.`);
    }

    return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read macOS Keychain (${keychain.label}): ${message}`, {
      cause: error,
    });
  }
}

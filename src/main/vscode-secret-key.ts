import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { DATA_DIR_SUFFIX } from "./dev-mode";

const KEY_LENGTH = 32; // 256 bits for AES-GCM
const KEY_PATH = join(homedir(), ".devspace", `vscode-secret${DATA_DIR_SUFFIX}.key`);

/** The endpoint path that the VS Code web client will POST to. */
export const SECRET_KEY_ENDPOINT = "/devspace-secret-key";

let cachedKey: Buffer | null = null;

function getSafeStorage(): {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
} {
  return (require("electron") as typeof import("electron")).safeStorage;
}

/**
 * Get (or generate) a stable 32-byte AES key.
 *
 * The key is encrypted at rest using Electron's safeStorage (backed by macOS
 * Keychain) and stored at ~/.devspace/vscode-secret.key.  The same key is
 * returned on every call so VS Code web can decrypt secrets that were
 * encrypted in a previous session.
 */
export function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;

  const safeStorage = getSafeStorage();

  if (existsSync(KEY_PATH)) {
    try {
      const encrypted = readFileSync(KEY_PATH);
      if (safeStorage.isEncryptionAvailable()) {
        const base64 = safeStorage.decryptString(encrypted);
        cachedKey = Buffer.from(base64, "base64");
        if (cachedKey.length === KEY_LENGTH) {
          console.log(
            `[vscode-secret-key] loaded existing key (${KEY_LENGTH} bytes) from ${KEY_PATH}`,
          );
          return cachedKey;
        }
        console.warn(`[vscode-secret-key] key wrong length (${cachedKey.length}), regenerating`);
        cachedKey = null;
      } else {
        // No encryption available (dev mode) — stored as plain base64
        cachedKey = Buffer.from(encrypted.toString("utf-8"), "base64");
        if (cachedKey.length === KEY_LENGTH) {
          console.log(`[vscode-secret-key] loaded existing key (dev/plain, ${KEY_LENGTH} bytes)`);
          return cachedKey;
        }
        cachedKey = null;
      }
    } catch (err) {
      console.warn(
        "[vscode-secret-key] failed to read key file, regenerating.",
        "This can happen when switching between dev and packaged mode (safeStorage uses different Keychain entries).",
        err,
      );
      cachedKey = null;
    }
  }

  // Generate a fresh key
  cachedKey = randomBytes(KEY_LENGTH);
  console.log(`[vscode-secret-key] generated new ${KEY_LENGTH}-byte key`);

  mkdirSync(dirname(KEY_PATH), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(cachedKey.toString("base64"));
    writeFileSync(KEY_PATH, encrypted);
    console.log(`[vscode-secret-key] saved encrypted key to ${KEY_PATH}`);
  } else {
    writeFileSync(KEY_PATH, cachedKey.toString("base64"), "utf-8");
    console.log(`[vscode-secret-key] saved plain key to ${KEY_PATH} (dev mode)`);
  }

  return cachedKey;
}

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

/**
 * Get (or generate) a stable 32-byte AES key.
 *
 * Stored as plain base64 at ~/.devspace/vscode-secret.key with owner-only
 * permissions (0o600).  The same key is returned on every call so VS Code
 * web can decrypt secrets that were encrypted in a previous session.
 *
 * Earlier versions encrypted this file with Electron's safeStorage (backed
 * by macOS Keychain), which triggered a "devspace Safe Storage" Keychain
 * authorization prompt on every launch.  The Keychain encryption added
 * negligible security — the file is already user-readable only, and the
 * threat model for a local dev tool doesn't warrant OS-level key wrapping.
 */
export function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;

  if (existsSync(KEY_PATH)) {
    try {
      const raw = readFileSync(KEY_PATH);
      cachedKey = Buffer.from(raw.toString("utf-8"), "base64");
      if (cachedKey.length === KEY_LENGTH) {
        console.log(
          `[vscode-secret-key] loaded existing key (${KEY_LENGTH} bytes) from ${KEY_PATH}`,
        );
        return cachedKey;
      }
      console.warn(`[vscode-secret-key] key wrong length (${cachedKey.length}), regenerating`);
      cachedKey = null;
    } catch (err) {
      console.warn("[vscode-secret-key] failed to read key file, regenerating.", err);
      cachedKey = null;
    }
  }

  // Generate a fresh key
  cachedKey = randomBytes(KEY_LENGTH);
  console.log(`[vscode-secret-key] generated new ${KEY_LENGTH}-byte key`);

  mkdirSync(dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, cachedKey.toString("base64"), { encoding: "utf-8", mode: 0o600 });
  console.log(`[vscode-secret-key] saved key to ${KEY_PATH}`);

  return cachedKey;
}

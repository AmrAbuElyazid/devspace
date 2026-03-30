// Validation helpers for IPC input sanitization

import path from "path";

const SAFARI_FULL_DISK_ACCESS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

export function getSafeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;
  if (rawUrl === SAFARI_FULL_DISK_ACCESS_SETTINGS_URL) return rawUrl;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    // Expected: invalid URL format
    return null;
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
  return parsedUrl.toString();
}

export function validateFilePath(rawPath: unknown, allowedRoots: string[]): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const resolved = path.resolve(rawPath);
  if (resolved.includes("..")) return null;
  const isAllowed = allowedRoots.some((root) => resolved.startsWith(path.resolve(root)));
  if (!isAllowed) return null;
  const sensitive = [".ssh", ".gnupg", ".aws", "credentials", ".env"];
  if (sensitive.some((s) => resolved.includes(s))) return null;
  return resolved;
}

// Validation helpers for IPC input sanitization

import { realpath } from "fs/promises";
import path from "path";

const SAFARI_FULL_DISK_ACCESS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
const SAFE_BROWSER_URL = "about:blank";
const MAX_NATIVE_BOUNDS_VALUE = 100_000;

type NativeViewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolvePathForValidation(resolvedPath: string): Promise<string | null> {
  try {
    return await realpath(resolvedPath);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") {
      return null;
    }
  }

  try {
    const resolvedParent = await realpath(path.dirname(resolvedPath));
    return path.join(resolvedParent, path.basename(resolvedPath));
  } catch {
    return null;
  }
}

async function resolveAllowedRoot(root: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  try {
    return await realpath(resolvedRoot);
  } catch {
    return resolvedRoot;
  }
}

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

export function getSafeBrowserUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string") return null;

  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0) return null;
  if (trimmedUrl === SAFE_BROWSER_URL) return SAFE_BROWSER_URL;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
  return parsedUrl.toString();
}

export function parseNativeViewBounds(rawBounds: unknown): NativeViewBounds | null {
  if (typeof rawBounds !== "object" || rawBounds === null) return null;
  const bounds = rawBounds as Partial<NativeViewBounds>;
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (
    Math.abs(bounds.x!) > MAX_NATIVE_BOUNDS_VALUE ||
    Math.abs(bounds.y!) > MAX_NATIVE_BOUNDS_VALUE
  ) {
    return null;
  }
  if (bounds.width! < 0 || bounds.height! < 0) return null;
  if (bounds.width! > MAX_NATIVE_BOUNDS_VALUE || bounds.height! > MAX_NATIVE_BOUNDS_VALUE) {
    return null;
  }

  return {
    x: bounds.x!,
    y: bounds.y!,
    width: bounds.width!,
    height: bounds.height!,
  };
}

export async function validateFilePath(
  rawPath: unknown,
  allowedRoots: string[],
): Promise<string | null> {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;

  const candidatePath = await resolvePathForValidation(path.resolve(rawPath));
  if (!candidatePath) return null;

  const resolvedAllowedRoots = await Promise.all(
    allowedRoots.map((root) => resolveAllowedRoot(root)),
  );
  const isAllowed = resolvedAllowedRoots.some((root) => isPathWithinRoot(candidatePath, root));
  if (!isAllowed) return null;

  const sensitive = [".ssh", ".gnupg", ".aws", "credentials", ".env"];
  const normalizedPath = candidatePath.toLowerCase();
  if (sensitive.some((segment) => normalizedPath.includes(segment))) return null;
  return candidatePath;
}

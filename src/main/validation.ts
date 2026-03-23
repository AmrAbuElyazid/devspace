// Validation helpers for IPC input sanitization

import path from 'path'

export function getSafeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return null
  return parsedUrl.toString()
}

export function validateTerminalDimensions(
  cols: unknown,
  rows: unknown
): { cols: number; rows: number } | null {
  if (typeof cols !== 'number' || typeof rows !== 'number') return null
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null
  if (cols < 20 || cols > 400 || rows < 5 || rows > 200) return null
  return { cols, rows }
}

export function validateFilePath(rawPath: unknown, allowedRoots: string[]): string | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null
  const resolved = path.resolve(rawPath)
  if (resolved.includes('..')) return null
  const isAllowed = allowedRoots.some((root) => resolved.startsWith(path.resolve(root)))
  if (!isAllowed) return null
  const sensitive = ['.ssh', '.gnupg', '.aws', 'credentials', '.env']
  if (sensitive.some((s) => resolved.includes(s))) return null
  return resolved
}

export function validatePtyWriteData(data: unknown): string | null {
  if (typeof data !== 'string') return null
  if (data.length > 1024 * 1024) return null
  return data
}

export function validatePtyId(ptyId: unknown): string | null {
  if (typeof ptyId !== 'string' || ptyId.length === 0) return null
  return ptyId
}

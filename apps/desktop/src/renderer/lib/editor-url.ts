/**
 * Utilities for detecting and parsing VS Code serve-web URLs.
 *
 * VS Code runs on `http://127.0.0.1:<port>` and uses a `?folder=<path>`
 * query parameter to open a workspace folder. The port varies between
 * dev (18662) and production (18562), so we detect by host pattern.
 */

/**
 * Extract the folder path from a VS Code serve-web URL.
 *
 * Returns the decoded `folder` query parameter value if the URL looks
 * like a local VS Code server URL (`http://127.0.0.1:*`), or `null`
 * if it doesn't match.
 */
export function extractEditorFolderFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || parsed.protocol !== "http:") {
      return null;
    }
    return parsed.searchParams.get("folder");
  } catch {
    return null;
  }
}

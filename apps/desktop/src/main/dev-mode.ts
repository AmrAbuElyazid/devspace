/**
 * Dev vs production mode detection and port isolation.
 *
 * When running via `electron-vite dev`, the dev instance uses offset ports
 * and separate data directories so it can coexist with a packaged .app build.
 */

export const IS_DEV = process.env.NODE_ENV === "development";

/** Port offset applied to all fixed ports in dev mode. */
const DEV_PORT_OFFSET = 100;

/** VS Code serve-web port. */
export const VSCODE_PORT = 18562 + (IS_DEV ? DEV_PORT_OFFSET : 0);

/** T3 Code server port range start. */
export const T3CODE_PORT_BASE = 18570 + (IS_DEV ? DEV_PORT_OFFSET : 0);

/** Electron session partition for the built-in browser. */
export const BROWSER_PARTITION = IS_DEV
  ? "persist:devspace-dev-browser"
  : "persist:devspace-global-browser";

/** Electron session partition for embedded editor panes. */
export const EDITOR_PARTITION = IS_DEV
  ? "persist:devspace-dev-editor"
  : "persist:devspace-global-editor";

/** Suffix for data directories that need isolation. */
export const DATA_DIR_SUFFIX = IS_DEV ? "-dev" : "";

/**
 * Port for the CLI HTTP server (`devspace .` talks to this).
 *
 * Overridable because it is otherwise fixed per mode, so anything that runs a
 * second instance — the e2e suite, most obviously, while a real app is open —
 * finds it already taken and silently has no CLI.
 */
export const CLI_PORT = resolveCliPort();

function resolveCliPort(): number {
  const override = Number(process.env.DEVSPACE_CLI_PORT);
  if (Number.isInteger(override) && override > 0 && override <= 65535) return override;
  return 21549 + (IS_DEV ? DEV_PORT_OFFSET : 0);
}

/**
 * Bounds for positioning a terminal surface within the window.
 * Coordinates are in CSS pixels relative to the window's content area.
 */
export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A reserved shortcut that prevents Ghostty from consuming app-level keybindings.
 * Matches the native bridge's ReservedShortcut struct.
 */
export interface ReservedShortcut {
  key: string;
  command: boolean;
  shift: boolean;
  option: boolean;
  control: boolean;
}

/**
 * Options for creating a new terminal surface.
 */
export interface CreateSurfaceOptions {
  /** Initial working directory for the shell. */
  cwd?: string;
  /** Additional environment variables to set for the shell process. */
  envVars?: Record<string, string>;
}

/**
 * Events emitted by the Ghostty bridge.
 */
export interface GhosttyEvents {
  "title-changed": (surfaceId: string, title: string) => void;
  "surface-closed": (surfaceId: string) => void;
  "surface-focused": (surfaceId: string) => void;
  "modifier-changed": (modifier: "command" | "control" | null) => void;
  "pwd-changed": (surfaceId: string, pwd: string) => void;
  notification: (surfaceId: string, title: string, body: string) => void;
  "search-start": (surfaceId: string, needle: string) => void;
  "search-end": (surfaceId: string) => void;
  "search-total": (surfaceId: string, total: number) => void;
  "search-selected": (surfaceId: string, selected: number) => void;
}

/**
 * Event name type — union of all event keys.
 */
export type GhosttyEventName = keyof GhosttyEvents;

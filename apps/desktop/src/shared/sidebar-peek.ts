/**
 * The collapsed sidebar's hover panel, as it crosses process boundaries.
 *
 * The panel is drawn by the overlay's renderer, which has no workspace store to
 * read — a native pane would slice off anything the main renderer drew there,
 * so the rows have to be shipped as data.
 */

export interface SidebarPeekWorkspace {
  kind: "workspace";
  id: string;
  name: string;
  /** Resolved CSS colour; the overlay shares the app's stylesheet and tokens. */
  color: string;
  directory: string | null;
  ports: number[];
  paneCount: number;
  active: boolean;
  depth: number;
}

export interface SidebarPeekFolder {
  kind: "folder";
  id: string;
  name: string;
  depth: number;
}

export type SidebarPeekRow = SidebarPeekWorkspace | SidebarPeekFolder;

export interface SidebarPeekSection {
  label: string;
  /** Matches whatever the sidebar's own header shows, or absent if it shows none. */
  count?: number;
  rows: SidebarPeekRow[];
}

export interface SidebarPeekSnapshot {
  dark: boolean;
  compact: boolean;
  /** The sidebar's own width, so the panel is the sidebar rather than a popup. */
  width: number;
  sections: SidebarPeekSection[];
}

/** What the main process needs to know to watch for the hover and place the panel. */
export interface SidebarPeekConfig {
  /** False while the sidebar is open, or while the feature has nothing to show. */
  enabled: boolean;
  /** Height of the app's own title bar, so the panel clears the traffic lights. */
  titleBarHeight: number;
  snapshot: SidebarPeekSnapshot;
}

function isPeekRow(value: unknown): value is SidebarPeekRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Omit<Partial<SidebarPeekWorkspace>, "kind"> & { kind?: string };
  if (typeof row.id !== "string" || typeof row.name !== "string") return false;
  if (typeof row.depth !== "number" || !Number.isFinite(row.depth)) return false;
  if (row.kind === "folder") return true;
  if (row.kind !== "workspace") return false;
  if (typeof row.color !== "string") return false;
  if (row.directory !== null && typeof row.directory !== "string") return false;
  if (typeof row.paneCount !== "number" || typeof row.active !== "boolean") return false;
  return Array.isArray(row.ports) && row.ports.every((port) => typeof port === "number");
}

export function isSidebarPeekConfig(value: unknown): value is SidebarPeekConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Partial<SidebarPeekConfig>;
  if (typeof config.enabled !== "boolean") return false;
  if (typeof config.titleBarHeight !== "number" || !Number.isFinite(config.titleBarHeight)) {
    return false;
  }

  const snapshot = config.snapshot;
  if (typeof snapshot !== "object" || snapshot === null) return false;
  if (typeof snapshot.dark !== "boolean" || typeof snapshot.compact !== "boolean") return false;
  if (typeof snapshot.width !== "number" || !Number.isFinite(snapshot.width)) return false;
  if (!Array.isArray(snapshot.sections)) return false;
  return snapshot.sections.every(
    (section) =>
      typeof section === "object" &&
      section !== null &&
      typeof (section as SidebarPeekSection).label === "string" &&
      Array.isArray((section as SidebarPeekSection).rows) &&
      (section as SidebarPeekSection).rows.every(isPeekRow),
  );
}

/** Gap between the panel and the window edges. */
export const SIDEBAR_PEEK_INSET = 8;

/**
 * How far into the window the cursor must come to open the panel.
 *
 * Narrow on purpose: this is a corner of the screen the user has no other
 * reason to visit, and a wide band would fire while they were reaching for a
 * terminal's left edge.
 */
export const SIDEBAR_PEEK_HOT_BAND = 10;

/**
 * How far past the panel the cursor may stray before it closes.
 *
 * Without it, the panel would snap shut on the pixel the pointer left its edge,
 * which makes a diagonal move towards a row feel like a trap.
 */
export const SIDEBAR_PEEK_LEAVE_SLOP = 24;

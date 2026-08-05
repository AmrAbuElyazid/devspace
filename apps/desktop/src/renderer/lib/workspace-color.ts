/**
 * Identity colours for workspaces.
 *
 * Stored as a key rather than a hex value so each theme can pick its own
 * rendering: the same "violet" has to hold contrast against a near-black rail
 * and a near-white one, which one literal cannot do. Resolution happens in CSS
 * via `--w-<key>`, defined per theme in globals.css.
 */
export const WORKSPACE_COLORS = [
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "red",
  "slate",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

const COLOR_SET = new Set<string>(WORKSPACE_COLORS);

export function isWorkspaceColor(value: unknown): value is WorkspaceColor {
  return typeof value === "string" && COLOR_SET.has(value);
}

/** CSS custom property holding the colour, e.g. `var(--w-violet)`. */
export function workspaceColorVar(color: WorkspaceColor): string {
  return `var(--w-${color})`;
}

/**
 * The colour a workspace shows when the user has not picked one.
 *
 * Derived from the id rather than defaulting to a single neutral, so a fresh
 * install already has distinguishable rows. Ids are nanoid, so a cheap sum is
 * evenly spread; the point is stability across restarts, not uniformity.
 */
function defaultWorkspaceColor(workspaceId: string): WorkspaceColor {
  let hash = 0;
  for (let i = 0; i < workspaceId.length; i += 1) {
    hash = (hash * 31 + workspaceId.charCodeAt(i)) >>> 0;
  }
  return WORKSPACE_COLORS[hash % WORKSPACE_COLORS.length] as WorkspaceColor;
}

export function resolveWorkspaceColor(workspaceId: string, stored: unknown): WorkspaceColor {
  return isWorkspaceColor(stored) ? stored : defaultWorkspaceColor(workspaceId);
}

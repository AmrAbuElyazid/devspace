const HOME_PREFIX_PATTERN = /^\/(?:Users|home)\/[^/]+(?=\/|$)/;

/**
 * A U+200E LEFT-TO-RIGHT MARK, prefixed to every path.
 *
 * The row renders this inside a `direction: rtl` box, which is what puts the
 * ellipsis on the *left* so the tail of the path survives — two worktrees of
 * one repo differ in their last segment, not their first. But `~` and `/` are
 * bidi-neutral, so in an RTL paragraph the leading `~/` resolves to the
 * paragraph direction and is reordered to the end: `…/apps/desktop/~`.
 *
 * `unicode-bidi: plaintext` fixes the order but moves the ellipsis back to the
 * right, losing the tail. A strong LTR character at the head fixes the order
 * while leaving the box's direction — and so the truncation side — alone.
 */
const LTR_MARK = "\u200e";

/**
 * Shorten an absolute path for a sidebar row: the home directory becomes `~`.
 * Everything else is left to CSS truncation.
 */
export function formatSidebarDirectory(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed.length === 0) return `${LTR_MARK}/`;
  return LTR_MARK + trimmed.replace(HOME_PREFIX_PATTERN, "~");
}

/**
 * Callout <-> GFM alert blockquote.
 *
 * Plate's stock callout rule serializes to MDX — `<callout icon="💡" id="…">` —
 * and mints a fresh `id` on every call, so the markdown text differs between two
 * serializations of the same document. With a debounced save on every keystroke
 * that means a note file churns on disk forever. Mapping to GitHub's alert
 * syntax instead is stable, readable, and portable to GitHub and Obsidian:
 *
 *     > [!WARNING]
 *     > Body text
 *
 * Alerts carry no icon slot, so the icon is derived from the variant rather than
 * stored. The callout UI offers exactly these five variants for the same reason:
 * a free-form emoji would have nowhere to live on disk.
 */

import type {
  DeserializeMdOptions,
  MdBlockquote,
  MdDecoration,
  MdRootContent,
  MdRules,
  SerializeMdOptions,
} from "@platejs/markdown";
import { convertNodesDeserialize, convertNodesSerialize, defaultRules } from "@platejs/markdown";
import type { TCalloutElement, TElement } from "platejs";
import { getPluginType, KEYS } from "platejs";

/** Alert kinds GitHub renders, in the order the UI offers them. */
export const CALLOUT_VARIANTS = ["note", "tip", "info", "warning", "error"] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

const ALERT_BY_VARIANT: Record<string, string> = {
  error: "CAUTION",
  info: "IMPORTANT",
  note: "NOTE",
  success: "TIP",
  tip: "TIP",
  warning: "WARNING",
};

const VARIANT_BY_ALERT: Record<string, CalloutVariant> = {
  CAUTION: "error",
  IMPORTANT: "info",
  NOTE: "note",
  TIP: "tip",
  WARNING: "warning",
};

export const CALLOUT_ICON_BY_VARIANT: Record<CalloutVariant, string> = {
  error: "\u{1F6D1}",
  info: "ℹ️",
  note: "\u{1F4DD}",
  tip: "\u{1F4A1}",
  warning: "⚠️",
};

export const CALLOUT_LABEL_BY_VARIANT: Record<CalloutVariant, string> = {
  error: "Caution",
  info: "Important",
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

/** Leading `[!NOTE]` marker, optionally followed by the rest of the paragraph. */
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\r?\n)?/i;

export function calloutVariantOf(element: { variant?: string }): CalloutVariant {
  const variant = element.variant ?? "";
  if ((CALLOUT_VARIANTS as readonly string[]).includes(variant)) {
    return variant as CalloutVariant;
  }
  // Tolerate legacy/unknown variants (e.g. "success") by routing them through
  // the alert mapping, which is lossy but never throws.
  const alert = ALERT_BY_VARIANT[variant];
  return (alert && VARIANT_BY_ALERT[alert]) || "note";
}

export function calloutIconOf(element: { icon?: string; variant?: string }): string {
  return element.icon || CALLOUT_ICON_BY_VARIANT[calloutVariantOf(element)];
}

/**
 * Strip the alert marker from a blockquote's children.
 *
 * Returns `null` when the blockquote is an ordinary quote, so the caller can
 * fall through to the default rule.
 */
function splitAlertMarker(
  children: MdRootContent[],
): { kind: string; rest: MdRootContent[] } | null {
  const [first, ...tail] = children;
  if (!first || first.type !== "paragraph") return null;

  const [firstChild, ...paragraphTail] = first.children;
  if (!firstChild || firstChild.type !== "text") return null;

  const match = ALERT_MARKER.exec(firstChild.value);
  if (!match) return null;

  const remainder = firstChild.value.slice(match[0].length);
  const paragraphChildren = remainder
    ? [{ ...firstChild, value: remainder }, ...paragraphTail]
    : paragraphTail;

  return {
    kind: match[1]!.toUpperCase(),
    rest:
      paragraphChildren.length > 0 ? [{ ...first, children: paragraphChildren }, ...tail] : tail,
  };
}

function emptyParagraph(options: DeserializeMdOptions): TElement {
  return {
    children: [{ text: "" }],
    type: getPluginType(options.editor!, KEYS.p),
  };
}

/**
 * Rules wiring callouts to alert blockquotes.
 *
 * `blockquote.deserialize` has to be overridden too: an alert *is* a blockquote
 * at the mdast level, so this is the only hook that sees it.
 */
export const calloutRules: MdRules = {
  blockquote: {
    deserialize: (
      mdastNode: MdBlockquote,
      deco: MdDecoration,
      options: DeserializeMdOptions,
    ): TElement => {
      const alert = splitAlertMarker(mdastNode.children);

      if (!alert) {
        return defaultRules.blockquote!.deserialize!(mdastNode, deco, options);
      }

      const children = convertNodesDeserialize(alert.rest, deco, options);
      const variant = VARIANT_BY_ALERT[alert.kind] ?? "note";

      return {
        children: children.length > 0 ? children : [emptyParagraph(options)],
        icon: CALLOUT_ICON_BY_VARIANT[variant],
        type: getPluginType(options.editor!, KEYS.callout),
        variant,
      };
    },
  },

  callout: {
    serialize: (slateNode: TCalloutElement, options: SerializeMdOptions): MdBlockquote => {
      const kind = ALERT_BY_VARIANT[calloutVariantOf(slateNode)] ?? "NOTE";
      // The marker rides as raw html, not text: remark-stringify escapes a
      // leading `[` to `\[`, and `> \[!NOTE]` is no longer an alert to GitHub
      // or Obsidian — which is the entire reason for this mapping.
      const marker = { type: "html" as const, value: `[!${kind}]` };
      const body = convertNodesSerialize(
        slateNode.children,
        options,
        true,
      ) as MdBlockquote["children"];
      const [first, ...tail] = body;

      // Fold the marker into the first paragraph so the output is the canonical
      // `> [!NOTE]\n> Body` rather than a marker paragraph followed by a blank
      // quote line.
      if (first?.type === "paragraph") {
        return {
          children: [
            {
              ...first,
              children: [marker, { type: "text", value: "\n" }, ...first.children],
            },
            ...tail,
          ],
          type: "blockquote",
        };
      }

      return {
        children: [{ children: [marker], type: "paragraph" }, ...body],
        type: "blockquote",
      };
    },
  },
};

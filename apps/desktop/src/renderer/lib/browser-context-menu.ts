import { buildSearchUrl } from "./browser-url";
import type { BrowserContextMenuRequest } from "../../shared/browser";
import type { ContextMenuItem } from "../../shared/types";

type BrowserContextMenuAction =
  | "page-back"
  | "page-forward"
  | "page-reload"
  | "page-copy-address"
  | "page-open-external"
  | "page-inspect"
  | "link-open-new-tab"
  | "link-open-external"
  | "link-copy"
  | "image-open-new-tab"
  | "image-open-external"
  | "image-copy-address"
  | "selection-copy"
  | "selection-search-web";

const SELECTION_LABEL_MAX_LENGTH = 24;

/** Shorten a selection for a menu label, preferring to break on a word. */
function summarizeSelection(selectionText: string): string {
  const collapsed = selectionText.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SELECTION_LABEL_MAX_LENGTH) {
    return collapsed;
  }

  const clipped = collapsed.slice(0, SELECTION_LABEL_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${lastSpace > SELECTION_LABEL_MAX_LENGTH / 2 ? clipped.slice(0, lastSpace) : clipped}…`;
}

export function buildBrowserContextMenuItems(
  request: BrowserContextMenuRequest,
): ContextMenuItem<BrowserContextMenuAction>[] {
  if (request.target === "link") {
    return [
      { id: "link-open-new-tab", label: "Open Link in New Tab" },
      { id: "link-open-external", label: "Open Link in External Browser" },
      { id: "link-copy", label: "Copy Link", separatorBefore: true },
    ];
  }

  if (request.target === "image") {
    return [
      { id: "image-open-new-tab", label: "Open Image in New Tab" },
      { id: "image-open-external", label: "Open Image in External Browser" },
      { id: "image-copy-address", label: "Copy Image Address", separatorBefore: true },
    ];
  }

  if (request.target === "selection") {
    const selection = request.selectionText ? summarizeSelection(request.selectionText) : null;
    return [
      { id: "selection-copy", label: "Copy" },
      {
        id: "selection-search-web",
        // Quoting the selection makes it obvious what is about to be handed to
        // a search engine — worth the label length when the click leaves the app.
        label: selection ? `Search the Web for “${selection}”` : "Search the Web",
        separatorBefore: true,
      },
    ];
  }

  return [
    // Back and Forward grey out rather than disappearing, so the menu keeps one
    // shape across pages and Reload never shifts out from under the cursor.
    { id: "page-back", label: "Back", disabled: !request.canGoBack },
    { id: "page-forward", label: "Forward", disabled: !request.canGoForward },
    { id: "page-reload", label: "Reload" },
    { id: "page-copy-address", label: "Copy Page Address", separatorBefore: true },
    { id: "page-open-external", label: "Open in External Browser" },
    { id: "page-inspect", label: "Inspect", separatorBefore: true },
  ];
}

export async function writeClipboardText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  }
}

export function getBrowserContextMenuSearchUrl(selectionText: string): string {
  return buildSearchUrl(selectionText);
}

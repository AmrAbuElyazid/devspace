import { buildSearchUrl } from "./browser-url";
import type { BrowserContextMenuRequest } from "../../shared/browser";
import type { ContextMenuItem } from "../../shared/types";

type BrowserContextMenuAction =
  | "page-back"
  | "page-forward"
  | "page-reload"
  | "page-inspect"
  | "link-open-new-tab"
  | "link-copy"
  | "selection-copy"
  | "selection-search-web";

export function buildBrowserContextMenuItems(
  request: BrowserContextMenuRequest,
): ContextMenuItem<BrowserContextMenuAction>[] {
  if (request.target === "link") {
    return [
      { id: "link-open-new-tab", label: "Open in New Tab" },
      { id: "link-copy", label: "Copy Link" },
    ];
  }

  if (request.target === "selection") {
    return [
      { id: "selection-copy", label: "Copy" },
      { id: "selection-search-web", label: "Search the Web" },
    ];
  }

  return [
    { id: "page-back", label: "Back" },
    { id: "page-forward", label: "Forward" },
    { id: "page-reload", label: "Reload" },
    { id: "page-inspect", label: "Inspect" },
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

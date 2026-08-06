import type { TElement, Value } from "platejs";
import { NodeApi } from "platejs";

export interface OutlineEntry {
  /** Node id when the document has one, otherwise the block index as a string. */
  id: string;
  /** 1-6. */
  level: number;
  /** Index into the editor value, for scrolling and folding. */
  path: number;
  title: string;
}

const HEADING_LEVEL: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

export function headingLevel(node: unknown): number | null {
  const type = (node as TElement | undefined)?.type;
  return typeof type === "string" ? (HEADING_LEVEL[type] ?? null) : null;
}

/** Top level headings, in document order. */
export function noteOutline(value: Value): OutlineEntry[] {
  return value.flatMap((node, index) => {
    const level = headingLevel(node);
    if (level === null) return [];

    const title = NodeApi.string(node).trim();

    return [
      {
        id: typeof node.id === "string" ? node.id : String(index),
        level,
        path: index,
        title: title || "Untitled section",
      },
    ];
  });
}

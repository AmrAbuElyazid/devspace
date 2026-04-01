import type { Value } from "platejs";

/** Extract a display title from editor value (first heading or first block text). */
export function extractNoteTitle(value: Value): string {
  const firstHeading = value.find(
    (node: Record<string, unknown>) =>
      node.type === "h1" || node.type === "h2" || node.type === "h3",
  );
  const node = firstHeading ?? value[0];
  const children = node?.children as Array<{ text?: string }> | undefined;

  return (
    children
      ?.map((child) => child.text ?? "")
      .join("")
      .slice(0, 40) || "Untitled Note"
  );
}

"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";

/** Spacing comes from the `.note-prose` rhythm, not from the node. */
export function ParagraphElement(props: PlateElementProps) {
  return <PlateElement {...props}>{props.children}</PlateElement>;
}
